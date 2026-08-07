import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { extractTextContent } from './whatsapp.service';

// Decisão de negócio confirmada com o usuário em 2026-08-06 (não é
// suposição do agente -- o doc da Fase 15 pedia explicitamente pra não
// escolher isso sozinho).
export const HUMAN_TAKEOVER_UNPAUSE_MINUTES = 30;

type MessageEcho = { to: string; id: string; type?: unknown; text?: unknown } & Record<string, unknown>;

// Fase 15.4 -- mesmo padrão preguiçoso do TTL de sessão (Fase 14.5): sem cron,
// a "despausa" é só a consequência de checar a idade de humanRepliedAt na
// próxima mensagem recebida. Só se aplica a pausa por humano (humanRepliedAt
// preenchido) -- pausa por transferir_para_humano (bot) não tem
// humanRepliedAt e continua exigindo destravar manualmente via /resume, como
// já era desde a Fase 14.
export function shouldAutoUnpause(
  conversation: { botPaused: boolean; humanRepliedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!conversation.botPaused || conversation.humanRepliedAt === null) return false;
  const minutesSince = (now.getTime() - conversation.humanRepliedAt.getTime()) / 60_000;
  return minutesSince > HUMAN_TAKEOVER_UNPAUSE_MINUTES;
}

// Upsert próprio (não reaproveita whatsapp.service.findOrCreateConversation):
// aquela função sempre bate lastInboundAt = now, correto pra mensagem que o
// CLIENTE mandou. Um eco é o oposto -- é o NEGÓCIO respondendo -- então não
// pode contaminar lastInboundAt (usado pelo TTL de sessão da Fase 14.5) com
// atividade que não é do cliente.
async function findOrCreateConversationForEcho(phone: string) {
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
}

// Fase 15.4 -- o garçom/atendente respondeu pelo app WhatsApp Business
// (Coexistence); o Meta espelha essa mensagem pro webhook via
// smb_message_echoes. Pausa o bot de verdade, grava a mensagem como OUT (o
// histórico mandado à OpenAI precisa saber o que o humano já disse) e loga.
export async function handleMessageEcho(echo: MessageEcho): Promise<void> {
  const conversation = await findOrCreateConversationForEcho(echo.to);
  const now = new Date();

  await prisma.whatsappConversation.update({
    where: { id: conversation.id },
    data: { botPaused: true, humanRepliedAt: now },
  });

  try {
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        waMessageId: echo.id ?? null,
        direction: 'OUT',
        content: extractTextContent(echo),
        rawPayload: echo as Prisma.InputJsonValue,
      },
    });
  } catch (err: unknown) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    // waMessageId duplicado -- reentrega do mesmo eco pelo Meta, já processado.
  }

  await createLog(prisma, {
    username: 'WhatsApp Business App',
    action: 'WHATSAPP_HUMAN_TAKEOVER',
    details: { conversationId: conversation.id, phone: echo.to, waMessageId: echo.id ?? null },
  });

  console.log('[WHATSAPP_HUMAN_TAKEOVER]', { conversationId: conversation.id, phone: echo.to });
}
