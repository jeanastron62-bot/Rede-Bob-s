import { MessageCircle } from 'lucide-react';
import type { InboxConversation } from '../../stores/useWhatsappInboxStore';
import type { ThreadMessage } from '../../stores/useWhatsappThreadStore';
import { horaCurta } from '../../utils/chatDate';

// PROVISÓRIO -- enquanto o envio pela Cloud API estiver bloqueado (erro
// 130497 da Meta, sem prazo). Remover este arquivo e o uso dele em
// WhatsappThread.tsx/WhatsappInbox.tsx quando o envio voltar (ver CONTEXTO,
// seção do recurso provisório).
//
// Não é integração com WhatsApp nenhuma -- é um link wa.me que abre o app de
// WhatsApp JÁ INSTALADO no celular do atendente, na conversa do cliente, com
// texto pré-preenchido. Quem manda a mensagem é o atendente, tocando
// "Enviar" dentro do próprio WhatsApp; nada aqui chama Graph API nem grava
// no banco.

const SAUDACAO_BASE =
  "Oi! Aqui é do Beb's Burguer 🍔 O WhatsApp do trailer está com um problema técnico, então estamos respondendo por este número.";

const CTA_PADRAO = 'Pode fazer seu pedido por aqui!';

const LOCALSTORAGE_KEY = 'bebs_respondido_outro_whatsapp';

type MapaRespondidos = Record<string, string>; // conversationId (string) -> ISO de quando marcou

function lerMapaRespondidos(): MapaRespondidos {
  try {
    const bruto = localStorage.getItem(LOCALSTORAGE_KEY);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function marcarRespondido(conversationId: number): void {
  try {
    const mapa = lerMapaRespondidos();
    mapa[String(conversationId)] = new Date().toISOString();
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(mapa));
  } catch {
    // localStorage indisponível (modo privado, cota, etc.) -- a marca é só
    // um selo informativo; falhar aqui não pode impedir o link de abrir.
  }
}

function lerRespondidoEm(conversationId: number): string | null {
  try {
    return lerMapaRespondidos()[String(conversationId)] ?? null;
  } catch {
    return null;
  }
}

// Texto do botão: saudação fixa + (texto da última mensagem, se ela foi OUT,
// FALHOU, e é mais recente que a última IN) ou o CTA padrão.
function montarTexto(messages: ThreadMessage[]): string {
  const ultima = messages[messages.length - 1];
  const ultimaIn = [...messages].reverse().find((m) => m.direction === 'IN');
  const ultimaFalhouDepoisDoIn =
    !!ultima &&
    ultima.direction === 'OUT' &&
    ultima.deliveryStatus === 'FALHOU' &&
    (!ultimaIn || new Date(ultima.createdAt).getTime() > new Date(ultimaIn.createdAt).getTime());

  const segundaParte = ultimaFalhouDepoisDoIn && ultima?.content ? ultima.content : CTA_PADRAO;
  return `${SAUDACAO_BASE}\n\n${segundaParte}`;
}

interface BotaoProps {
  conversation: Pick<InboxConversation, 'id' | 'phone'>;
  messages: ThreadMessage[];
}

export function BotaoResponderOutroWhatsapp({ conversation, messages }: BotaoProps) {
  const digitos = conversation.phone.replace(/\D/g, '');
  const texto = montarTexto(messages);
  const href = `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => marcarRespondido(conversation.id)}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-850 border border-neutral-750 px-4 text-sm font-bold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
    >
      <MessageCircle size={18} />
      Responder por outro WhatsApp
    </a>
  );
}

interface SeloProps {
  conversation: Pick<InboxConversation, 'id' | 'lastInboundAt'>;
}

// Mostrado na thread E na lista (mesmo dado, mesma regra de "sumir"): ler
// direto do localStorage em cada render é barato (JSON pequeno) e evita
// duplicar estado em outro store só pra um recurso provisório.
export function SeloRespondidoOutroWhatsapp({ conversation }: SeloProps) {
  const respondidoEm = lerRespondidoEm(conversation.id);
  if (!respondidoEm) return null;

  // Mensagem nova do cliente depois da marca -- ela não vale mais pra esta
  // conversa, some até o atendente tocar o botão de novo.
  if (conversation.lastInboundAt && new Date(conversation.lastInboundAt).getTime() > new Date(respondidoEm).getTime()) {
    return null;
  }

  return (
    <span className="font-mono text-xs text-secondary">
      Respondido por outro WhatsApp às {horaCurta(respondidoEm)}
    </span>
  );
}
