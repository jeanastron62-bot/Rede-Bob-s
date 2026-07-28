import { prisma } from '../../config/prisma';
import type { WhatsappMessage } from '@prisma/client';

const SESSION_TTL_MINUTES = 60;

export async function getRecentHistory(conversationId: number) {
  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  const sessionStart = conversation.lastInboundAt
    ? new Date(conversation.lastInboundAt.getTime() - SESSION_TTL_MINUTES * 60_000)
    : new Date(0);

  // Se a última mensagem anterior foi há mais de 1h, não existe "sessão
  // anterior" -- a busca abaixo já não vai encontrar nada além da mensagem
  // atual, o que é o comportamento certo (sessão nova, sem contexto velho).
  return prisma.whatsappMessage.findMany({
    where: { conversationId, createdAt: { gte: sessionStart } },
    orderBy: { createdAt: 'asc' },
  });
}

// Mensagem de mídia sem transcrição (áudio/imagem, fora de escopo desta fase)
// não tem `content` -- não entra no histórico mandado pra OpenAI, mensagem
// vazia só custaria token à toa e confundiria o modelo.
export function toChatFormat(history: WhatsappMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter((m): m is WhatsappMessage & { content: string } => m.content !== null)
    .map((m) => ({ role: m.direction === 'IN' ? 'user' : 'assistant', content: m.content }));
}
