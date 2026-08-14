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
// Fallback pro par de variáveis de ambiente global (Fase 13/14) enquanto
// nenhuma WhatsappBusinessAccount foi conectada de verdade ainda -- remover
// esse fallback e as duas variáveis do .env.example quando a Fase 15 estiver
// ligada de ponta a ponta em produção.
async function resolveSendCredentials(
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
