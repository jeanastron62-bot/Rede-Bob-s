import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';

export async function sendWhatsappText(
  to: string,
  conversationId: number,
  text: string,
  sourcePayload?: unknown
) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
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
      content: text,
      rawPayload: (sourcePayload ?? result) as Prisma.InputJsonValue,
    },
  });
}
