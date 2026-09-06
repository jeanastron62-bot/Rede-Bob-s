import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { decryptToken } from '../../utils/tokenCrypto';

// O modelo escreve markdown padrão (** pra negrito, #, ```, -, [texto](url)),
// mas o WhatsApp só entende um subconjunto próprio: *negrito* (asterisco
// simples), _itálico_, ~riscado~. Sem essa conversão o cliente vê os símbolos
// literais na tela (ex.: "**Combo**" em vez de negrito de verdade).
function toWhatsappFormatting(text: string): string {
  return text
    // **negrito** -> *negrito* -- precisa rodar antes de qualquer coisa que
    // dependa de asterisco simples já estar no formato final.
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // ```bloco de código``` -> texto puro, sem os delimitadores
    .replace(/```([\s\S]*?)```/g, '$1')
    // ## Título -> Título, sem o(s) #
    .replace(/^#{1,6}\s+/gm, '')
    // [texto](url) -> texto: url -- o WhatsApp já linkifica url solta
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    // - item / * item (lista markdown) -> • item
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

// Fase 15.3 -- resolve QUAL conta responde por phoneNumberId (o número em
// que a mensagem do cliente chegou), nunca "pega a conta ativa" -- com duas
// WABAs conectadas, a segunda abordagem responde pelo número errado, em
// silêncio (ver doc da Fase 15, "Ponto de atenção").
//
// O par de variáveis de ambiente global (META_ACCESS_TOKEN /
// META_PHONE_NUMBER_ID) é BOOTSTRAP, e permanece: é o que faz o bot funcionar
// enquanto nenhuma conta foi conectada, e é por onde o número de teste da Meta
// responde. Não é transitório "até a Fase 15 ligar" -- some só se um dia a
// tabela deixar de poder estar vazia.
//
// O que ele NÃO pode ser é rede de segurança quando já existe conta conectada:
// aí cair no env significa responder pelo número global (hoje o de teste) em
// silêncio -- o cliente não recebe nada e nada no log explica.
//
// Daí a regra única: QUALQUER linha em WhatsappBusinessAccount desliga o env.
// Uma regra só, checada num lugar só, vale mais que duas condições paralelas
// aqui -- a primeira versão desta guarda vivia dentro do `if (phoneNumberId)`
// e deixava passar exatamente o caso em que o webhook não trazia o número.
export async function resolveSendCredentials(
  phoneNumberId: string | undefined
): Promise<{ accessToken: string; phoneNumberId: string }> {
  if (phoneNumberId) {
    const account = await prisma.whatsappBusinessAccount.findFirst({
      where: { phoneNumberId, active: true },
    });
    if (account) {
      return { accessToken: decryptToken(account.accessToken), phoneNumberId: account.phoneNumberId };
    }
  }

  // FORA do if de propósito: a checagem tem que valer também quando o webhook
  // não trouxe número nenhum. Falhar alto é melhor que responder errado -- o
  // erro sobe pro catch da receive() e vira log; responder pelo número errado
  // não aparece em lugar nenhum até o cliente reclamar que ninguém respondeu.
  const contasConectadas = await prisma.whatsappBusinessAccount.count();
  if (contasConectadas > 0) {
    if (!phoneNumberId) {
      // Mensagem própria, e deliberadamente explícita: este caminho só existe
      // se o payload do Meta chegou sem metadata.phone_number_id. Se ele
      // aparecer no log, a premissa da Fase 15.1 -- de que todo webhook de
      // `messages` traz esse campo -- está errada, e o roteamento por número
      // inteiro precisa ser revisto. Isso é informação de arquitetura, não
      // um "envio falhou".
      throw new Error(
        'Webhook recebido sem metadata.phone_number_id, e existe conta WhatsApp conectada — envio abortado para não responder pelo número errado. ATENÇÃO: se este erro aparecer, a premissa da Fase 15.1 (todo webhook de mensagem traz metadata.phone_number_id) está errada e o roteamento por número precisa ser revisto.'
      );
    }
    throw new Error(
      `Nenhuma conta ativa para phoneNumberId ${phoneNumberId} — envio abortado para não responder pelo número errado.`
    );
  }

  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error(
      'Nenhuma conta WhatsApp conectada e META_ACCESS_TOKEN/META_PHONE_NUMBER_ID não configurados -- impossível enviar mensagem.'
    );
  }
  return { accessToken: env.META_ACCESS_TOKEN, phoneNumberId: env.META_PHONE_NUMBER_ID };
}

export async function sendWhatsappText(
  to: string,
  conversationId: number,
  text: string,
  sourcePayload?: unknown,
  originPhoneNumberId?: string
) {
  const { accessToken, phoneNumberId } = await resolveSendCredentials(originPhoneNumberId);
  const formattedText = toWhatsappFormatting(text);

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: formattedText },
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao enviar mensagem no WhatsApp: ${JSON.stringify(result)}`);
  }

  await prisma.whatsappMessage.create({
    data: {
      conversationId,
      waMessageId: result.messages?.[0]?.id ?? null,
      direction: 'OUT',
      content: formattedText,
      rawPayload: (sourcePayload ?? result) as Prisma.InputJsonValue,
    },
  });
}
