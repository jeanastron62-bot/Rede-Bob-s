import { Request, Response } from 'express';
import { env } from '../../config/env';
import {
  isValidSignature,
  storeInboundMessages,
  extractMessages,
  extractMessageEchoes,
  findOrCreateConversation,
  dispatchToolCall,
  resumeConversation as resumeConversationService,
  getPausedConversations,
  NON_TEXT_REPLIES,
  NON_TEXT_REPLY_DEFAULT,
} from './whatsapp.service';
import { isRateLimited } from './whatsappRateLimit';
import { buildSystemPrompt } from './promptBuilder';
import { getRecentHistory, toChatFormat } from './conversationHistory';
import { callOpenAI, type ChatMessage } from './openaiClient';
import { sendWhatsappText } from './sendMessage';
import { handleMessageEcho, shouldAutoUnpause, HUMAN_TAKEOVER_UNPAUSE_MINUTES } from './humanTakeover';
import * as embeddedSignupService from './embeddedSignup.service';

export const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Sem token configurado, nada a comparar -- nunca deixa passar (um
  // `undefined === undefined` acidental validaria qualquer requisição).
  if (!env.META_VERIFY_TOKEN) {
    console.error('[WHATSAPP_CONFIG_MISSING] META_VERIFY_TOKEN não configurado -- verificação recusada.');
    res.sendStatus(403);
    return;
  }
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
    const echoes = extractMessageEchoes(req.body);
    console.log('[WHATSAPP_WEBHOOK_RECEIVED]', { messages: messages.length, echoes: echoes.length });
    await storeInboundMessages(req.body);

    // Fase 15.4 -- eco de mensagem que o humano mandou pelo app WhatsApp
    // Business (Coexistence): pausa o bot pra valer antes de processar
    // qualquer coisa mais nesta requisição.
    for (const echo of echoes) {
      await handleMessageEcho(echo);
    }

    for (const message of messages) {
      let conversation = await findOrCreateConversation(message.from);

      if (conversation.botPaused) {
        if (shouldAutoUnpause(conversation)) {
          // Fase 15.4 -- despausa preguiçosa: mais de N minutos desde que um
          // humano respondeu por último, o bot retoma sozinho na próxima
          // mensagem do cliente. Só se aplica a pausa por humano
          // (humanRepliedAt preenchido) -- pausa por transferir_para_humano
          // continua exigindo /resume manual, como já era.
          conversation = await resumeConversationService(conversation.id);
          console.log('[WHATSAPP_BOT_AUTO_RESUME]', {
            conversationId: conversation.id,
            afterMinutes: HUMAN_TAKEOVER_UNPAUSE_MINUTES,
          });
        } else {
          console.log('[WHATSAPP_BOT_PAUSED_SKIP]', {
            phone: message.from,
            conversationId: conversation.id,
          });
          continue; // silenciado de verdade -- nem chama a OpenAI
        }
      }

      if (await isRateLimited(message.from)) {
        console.log('[WHATSAPP_RATE_LIMITED]', {
          phone: message.from,
          conversationId: conversation.id,
        });
        await sendWhatsappText(
          message.from,
          conversation.id,
          'Recebi muitas mensagens suas em pouco tempo, aguarda um instante e tenta de novo.',
          undefined,
          message.phoneNumberId
        );
        continue;
      }

      const messageType = typeof message.type === 'string' ? message.type : undefined;
      if (messageType !== 'text') {
        // Sem transcrição/visão, não tem o que mandar pro modelo -- resposta
        // fixa por tipo, sem gastar chamada de OpenAI (ver whatsapp.service.ts,
        // NON_TEXT_REPLIES). A mensagem em si já foi gravada com content:null
        // e rawPayload completo por storeInboundMessages, antes deste loop.
        console.log('[WHATSAPP_NON_TEXT_MESSAGE]', {
          phone: message.from,
          conversationId: conversation.id,
          type: messageType,
        });
        const replyText = (messageType && NON_TEXT_REPLIES[messageType]) || NON_TEXT_REPLY_DEFAULT;
        await sendWhatsappText(message.from, conversation.id, replyText, undefined, message.phoneNumberId);
        continue;
      }

      try {
        const systemPrompt = await buildSystemPrompt();
        const history = await getRecentHistory(conversation.id);
        const chatHistory = toChatFormat(history);
        const completion = await callOpenAI(systemPrompt, chatHistory);

        const choice = completion.choices[0].message;
        let replyText: string;
        // Guardado pra registrar no rawPayload da mensagem OUT (linha do
        // sendWhatsappText abaixo) a resposta que realmente gerou o texto
        // enviado -- a primeira completion só decidiu chamar a função, não
        // tem o texto final quando há tool call.
        let lastCompletion = completion;

        if (choice.tool_calls?.length) {
          // Processa TODAS as tool_calls, não só a primeira -- a API pode
          // devolver mais de uma no mesmo turno (ex.: modelo interpretando
          // "dois itens" como duas chamadas de criar_pedido em vez de um
          // array `itens` só). O protocolo de tool calling exige uma
          // mensagem role:'tool' por tool_call_id declarado na mensagem do
          // assistant abaixo; faltar uma deixa o turno seguinte sem como
          // fechar em texto (content some, vira null).
          const toolResultMessages: ChatMessage[] = [];
          for (const call of choice.tool_calls) {
            const toolResult = await dispatchToolCall(
              call.function.name,
              JSON.parse(call.function.arguments),
              conversation.id,
              message.from
            );
            toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: toolResult });
          }

          // Fecha o round-trip de function calling: sem devolver o
          // resultado da função pro modelo, ele nunca vê o número do
          // pedido/motivo do erro e não consegue confirmar como manda o
          // passo 10 do system prompt -- usar o resultado cru como resposta
          // ao cliente era exatamente o bug (ver whatsapp.controller.ts,
          // histórico desta função).
          lastCompletion = await callOpenAI(systemPrompt, [
            ...chatHistory,
            { role: 'assistant', content: choice.content, tool_calls: choice.tool_calls },
            ...toolResultMessages,
          ]);
          replyText = lastCompletion.choices[0].message.content ?? '';
        } else {
          replyText = choice.content ?? '';
        }

        // Handoff chamado -- resposta ao cliente fica determinística, não no
        // que o modelo decidir escrever depois do tool_call. O system prompt
        // já pede "pare de responder", mas isso é texto livre, não garantia;
        // aqui garante que o cliente sempre saiba que um atendente foi
        // acionado, mesmo se o modelo produzir algo estranho ou vazio.
        if (choice.tool_calls?.some((call) => call.function.name === 'transferir_para_humano')) {
          replyText = 'Já chamei um atendente pra te ajudar, só um instante 👍';
        }

        // Guarda contra resposta vazia -- content pode vir null/'' quando o
        // modelo decide chamar outra função em vez de responder em texto
        // (ou qualquer outro motivo). Mandar string vazia pro Meta derruba
        // o envio ("text.body is required") e o cliente fica sem resposta
        // nenhuma; nunca chama sendWhatsappText sem texto de verdade.
        if (!replyText.trim()) {
          console.error('[WHATSAPP_BOT_EMPTY_REPLY]', {
            conversationId: conversation.id,
            hadToolCalls: Boolean(choice.tool_calls?.length),
          });
          replyText = 'Tive um problema técnico agora, já te retorno.';
        }

        // Visibilidade do que o modelo decidiu mesmo se o envio real ao Meta
        // falhar depois (ex.: sem META_ACCESS_TOKEN de produção ainda) --
        // sem isso, uma falha no envio esconderia a resposta computada.
        console.log('[WHATSAPP_BOT_REPLY]', { conversationId: conversation.id, replyText });

        await sendWhatsappText(message.from, conversation.id, replyText, lastCompletion, message.phoneNumberId);
      } catch (innerErr) {
        // Fecha exatamente a lacuna apontada depois da Fase 13: falha aqui
        // não pode virar silêncio. O Meta já recebeu 200 e não reenvia --
        // se essa mensagem de fallback também falhar, não há mais o que
        // fazer localmente, e isso fica registrado no log, não escondido.
        console.error('[WHATSAPP_BOT_FAILURE]', { phone: message.from, error: innerErr });
        await sendWhatsappText(
          message.from,
          conversation.id,
          'Tive um problema técnico agora, já te retorno.',
          undefined,
          message.phoneNumberId
        ).catch((sendErr) => console.error('[WHATSAPP_BOT_FAILURE_DOUBLE]', { phone: message.from, sendErr }));
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err);
  }
};

export const listPausedConversations = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const conversations = await getPausedConversations();
    res.json(conversations);
  } catch (err) {
    next(err);
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

// FASE 15.3 -- ver nota de "não testado ao vivo" em embeddedSignup.service.ts.
export const connectBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const { code, sessionInfo } = req.body ?? {};
    if (typeof code !== 'string' || !code) {
      res.status(400).json({ error: 'code é obrigatório.' });
      return;
    }
    const account = await embeddedSignupService.connectBusinessAccount({ code, sessionInfo }, req.user!);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
};

export const getBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const account = await embeddedSignupService.getActiveBusinessAccount();
    res.json(account);
  } catch (err) {
    next(err);
  }
};

export const disconnectBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const id = Number(req.params.id);
    const account = await embeddedSignupService.disconnectBusinessAccount(id, req.user!);
    res.json(account);
  } catch (err) {
    next(err);
  }
};
