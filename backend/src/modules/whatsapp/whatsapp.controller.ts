import { Request, Response } from 'express';
import { env } from '../../config/env';
import {
  isValidSignature,
  storeInboundMessages,
  extractMessages,
  findOrCreateConversation,
  dispatchToolCall,
  resumeConversation as resumeConversationService,
} from './whatsapp.service';
import { isRateLimited } from './whatsappRateLimit';
import { buildSystemPrompt } from './promptBuilder';
import { getRecentHistory, toChatFormat } from './conversationHistory';
import { callOpenAI } from './openaiClient';
import { sendWhatsappText } from './sendMessage';

export const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
};

export const receive = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!req.rawBody || !isValidSignature(req.rawBody, signature)) {
    res.sendStatus(401);
    return;
  }

  // Responde 200 imediatamente -- Meta reenvia com backoff se demorar, e
  // reenvio duplicado é exatamente o cenário que waMessageId único evita.
  res.sendStatus(200);

  try {
    const messages = extractMessages(req.body);
    await storeInboundMessages(req.body);

    for (const message of messages) {
      const conversation = await findOrCreateConversation(message.from);

      if (conversation.botPaused) continue; // silenciado de verdade -- nem chama a OpenAI

      if (await isRateLimited(message.from)) {
        await sendWhatsappText(
          message.from,
          conversation.id,
          'Recebi muitas mensagens suas em pouco tempo, aguarda um instante e tenta de novo.'
        );
        continue;
      }

      try {
        const systemPrompt = await buildSystemPrompt();
        const history = await getRecentHistory(conversation.id);
        const completion = await callOpenAI(systemPrompt, toChatFormat(history));

        const choice = completion.choices[0].message;
        let replyText: string;

        if (choice.tool_calls?.length) {
          const call = choice.tool_calls[0];
          replyText = await dispatchToolCall(call.function.name, JSON.parse(call.function.arguments), conversation.id);
        } else {
          replyText = choice.content ?? '';
        }

        // Visibilidade do que o modelo decidiu mesmo se o envio real ao Meta
        // falhar depois (ex.: sem META_ACCESS_TOKEN de produção ainda) --
        // sem isso, uma falha no envio esconderia a resposta computada.
        console.log('[WHATSAPP_BOT_REPLY]', { conversationId: conversation.id, replyText });

        await sendWhatsappText(message.from, conversation.id, replyText, completion);
      } catch (innerErr) {
        // Fecha exatamente a lacuna apontada depois da Fase 13: falha aqui
        // não pode virar silêncio. O Meta já recebeu 200 e não reenvia --
        // se essa mensagem de fallback também falhar, não há mais o que
        // fazer localmente, e isso fica registrado no log, não escondido.
        console.error('[WHATSAPP_BOT_FAILURE]', { phone: message.from, error: innerErr });
        await sendWhatsappText(message.from, conversation.id, 'Tive um problema técnico agora, já te retorno.').catch((sendErr) =>
          console.error('[WHATSAPP_BOT_FAILURE_DOUBLE]', { phone: message.from, sendErr })
        );
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err);
  }
};

export const resumeConversation = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const id = Number(req.params.id);
    const conversation = await resumeConversationService(id);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
};
