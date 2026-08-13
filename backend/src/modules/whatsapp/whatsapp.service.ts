import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { listItems } from '../menu/menu.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';

export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  // Sem segredo configurado não há como validar nada -- rejeita, nunca aceita.
  // (Aceitar seria pior que o webhook não funcionar: qualquer um poderia
  // injetar mensagem no sistema.)
  if (!env.META_APP_SECRET) {
    console.error('[WHATSAPP_CONFIG_MISSING] META_APP_SECRET não configurado -- webhook rejeitado.');
    return false;
  }
  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Formato mínimo que esta fase precisa do payload do Meta -- o resto (tipo de
// mensagem, mídia, etc.) é gravado como veio em rawPayload, sem tipar aqui.
type InboundMessage = { from: string; id: string } & Record<string, unknown>;

// Fase 15.4 -- eco de mensagem que a PRÓPRIA equipe mandou pelo app WhatsApp
// Business (Coexistence). "to" é o cliente que recebeu; não tem "from" no
// sentido de cliente, o remetente é o número do negócio.
type MessageEcho = { to: string; id: string; type?: string } & Record<string, unknown>;

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: InboundMessage[];
        // Fase 15.4 -- mensagens que o negócio mandou pelo app WhatsApp
        // Business, espelhadas pro webhook (campo smb_message_echoes).
        message_echoes?: MessageEcho[];
        // Fase 15.3 -- de qual número da WABA esta mensagem chegou. É por
        // este campo (não por "pega a conta ativa") que sendMessage.ts
        // decide com qual WhatsappBusinessAccount responder.
        metadata?: { phone_number_id?: string };
        // statuses (recibos de entrega/leitura) são ignorados nesta fase --
        // não fazem parte do escopo de mensagem recebida.
      };
    }>;
  }>;
}

// Fase 14.8 -- extraída da navegação que antes vivia só dentro de
// storeInboundMessages, agora compartilhada com o loop novo em receive()
// (whatsapp.controller.ts), pra não duplicar a mesma navegação de payload.
// Fase 15.3 -- cada mensagem carrega o phoneNumberId de origem (do irmão
// "metadata" no mesmo "value"), pra sendMessage.ts saber por qual
// WhatsappBusinessAccount responder.
export function extractMessages(payload: WhatsappWebhookPayload): Array<InboundMessage & { phoneNumberId?: string }> {
  const messages: Array<InboundMessage & { phoneNumberId?: string }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      for (const message of change.value?.messages ?? []) {
        messages.push({ ...message, phoneNumberId });
      }
    }
  }
  return messages;
}

// Fase 15.4 -- mesma navegação de extractMessages, pro campo message_echoes.
export function extractMessageEchoes(payload: WhatsappWebhookPayload): MessageEcho[] {
  const echoes: MessageEcho[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const echo of change.value?.message_echoes ?? []) {
        echoes.push(echo);
      }
    }
  }
  return echoes;
}

// Texto legível pro histórico/OpenAI -- só mensagem de texto tem isso nesta
// fase. Áudio/imagem ficam com content null (transcrição é escopo futuro).
// Exportado: Fase 15.4 reaproveita pra extrair texto de message_echoes, mesmo
// formato { type: 'text', text: { body } } usado pelas mensagens recebidas.
export function extractTextContent(message: Record<string, unknown>): string | null {
  if (message.type === 'text') {
    const text = message.text as { body?: string } | undefined;
    return text?.body ?? null;
  }
  return null;
}

// Fase 14.8 -- exportada (antes era privada): o novo loop em receive() precisa
// dela pra saber em qual conversationId gravar/consultar, não só
// storeInboundMessages.
export async function findOrCreateConversation(phone: string) {
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: { lastInboundAt: new Date() },
    create: { phone, lastInboundAt: new Date() },
  });
}

export async function storeInboundMessages(payload: WhatsappWebhookPayload): Promise<void> {
  const messages = extractMessages(payload);
  for (const { phoneNumberId: _phoneNumberId, ...message } of messages) {
    // phoneNumberId é contexto adicionado por extractMessages (Fase 15.3),
    // não fazia parte do payload original do Meta -- não entra em
    // rawPayload, que precisa continuar sendo exatamente o que chegou.
    const conversation = await findOrCreateConversation(message.from);

    try {
      await prisma.whatsappMessage.create({
        data: {
          conversationId: conversation.id,
          waMessageId: message.id,
          direction: 'IN',
          content: extractTextContent(message),
          rawPayload: message as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // waMessageId duplicado -- reentrega do Meta, já processada. Não é erro.
        continue;
      }
      throw err;
    }
  }
}

// Formato exato do schema `criar_pedido` em tools.ts -- o modelo só manda
// nome_item/nome_adicional/bairro (texto), nunca ID (ver nota de resolução
// nome -> ID em docs/bebs-burguer-bot-whatsapp-PROMPT.md, seção 2).
interface CriarPedidoArgs {
  tipo: 'RETIRADA' | 'DELIVERY';
  nome_cliente: string;
  bairro: string | null;
  endereco: string | null;
  itens: Array<{
    nome_item: string;
    quantidade: number;
    escolha_obrigatoria: string | null;
    adicionais: Array<{ nome_adicional: string; quantidade: number }>;
    observacoes: string | null;
  }>;
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CREDITO' | 'DEBITO';
  valor_pago_dinheiro: number | null;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

// Resolve nome_item/nome_adicional/bairro pro cardápio e pra lista de bairros
// vivos (buscados agora, não confia em nada que o modelo "lembrou" do início
// da conversa). Lança {status, message} no mesmo formato que
// orders.service.ts já usa -- cai no catch de criar_pedido em dispatchToolCall
// e vira resultado de erro da tool, nunca exceção que derruba a resposta.
async function resolveCriarPedidoData(args: CriarPedidoArgs, phone: string) {
  const menuItems = await listItems(false);
  const itemByName = new Map(menuItems.map((m) => [normalizeName(m.name), m]));

  const items = args.itens.map((it) => {
    const dbItem = itemByName.get(normalizeName(it.nome_item));
    if (!dbItem) {
      throw { status: 400, message: `Item '${it.nome_item}' não encontrado no cardápio atual.` };
    }
    const extras = it.adicionais.map((ad) => {
      const dbExtra = itemByName.get(normalizeName(ad.nome_adicional));
      if (!dbExtra) {
        throw { status: 400, message: `Adicional '${ad.nome_adicional}' não encontrado no cardápio atual.` };
      }
      return { menuItemId: dbExtra.id, quantity: ad.quantidade };
    });
    return {
      menuItemId: dbItem.id,
      quantity: it.quantidade,
      observations: it.observacoes,
      selectedChoice: it.escolha_obrigatoria,
      extras,
    };
  });

  let neighborhoodId: number | null = null;
  if (args.tipo === 'DELIVERY') {
    const neighborhoods = await listNeighborhoods();
    const neighborhood = neighborhoods.find((n) => normalizeName(n.name) === normalizeName(args.bairro ?? ''));
    if (!neighborhood) {
      throw { status: 400, message: `Bairro '${args.bairro}' não está na lista atendida.` };
    }
    neighborhoodId = neighborhood.id;
  }

  return {
    type: args.tipo,
    paymentMethod: args.forma_pagamento,
    cashPaidAmount: args.forma_pagamento === 'DINHEIRO' ? args.valor_pago_dinheiro : null,
    customerName: args.nome_cliente,
    customerPhone: phone,
    customerAddress: args.tipo === 'DELIVERY' ? args.endereco : null,
    neighborhoodId,
    items,
  };
}

// Chama o createOrder de verdade (mesmo caminho do cardápio web, inclusive o
// emit de order:created pro painel) e devolve o resultado como conteúdo da
// tool -- nunca deixa uma falha de negócio (delivery bloqueado, item
// esgotado, bairro fora de área) virar exceção: o passo 9 do system prompt
// só funciona se o modelo receber esse motivo pra repassar ao cliente.
async function handleCriarPedido(args: CriarPedidoArgs, phone: string): Promise<string> {
  try {
    const data = await resolveCriarPedidoData(args, phone);
    const order = await ordersService.createOrder(data, undefined, 'Cliente (WhatsApp)', true);
    return JSON.stringify({ sucesso: true, numero_pedido: order.id, total: Number(order.total) });
  } catch (err: any) {
    const message = err?.message ?? 'Não foi possível criar o pedido agora.';
    console.error('[WHATSAPP_BOT_CRIAR_PEDIDO_FAILED]', { phone, args, error: err });
    return JSON.stringify({ sucesso: false, erro: message });
  }
}

export async function dispatchToolCall(
  name: string,
  args: Record<string, unknown>,
  conversationId: number,
  phone: string
): Promise<string> {
  if (name === 'criar_pedido') {
    return handleCriarPedido(args as unknown as CriarPedidoArgs, phone);
  }

  if (name === 'transferir_para_humano') {
    await prisma.whatsappConversation.update({
      where: { id: conversationId },
      data: { botPaused: true },
    });
    console.log('[WHATSAPP_BOT_HANDOFF]', { conversationId, motivo: args.motivo, resumo: args.resumo });
    // Resultado da tool, não texto final -- o controller manda de volta pra
    // OpenAI, que já sabe (system prompt) o que dizer nesse caso.
    return JSON.stringify({ sucesso: true });
  }

  console.log('[WHATSAPP_BOT_STUB_CALL]', { conversationId, name, args });
  return 'Isso ainda está sendo configurado por aqui -- já te chamamos assim que possível.';
}

// Fase 14.7 -- destrava conversa pausada por transferir_para_humano. Sem UI
// de caixa de entrada ainda (fase futura); só o endpoint pra não deixar a
// conversa presa pra sempre depois de um handoff.
export async function resumeConversation(conversationId: number) {
  return prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: { botPaused: false },
  });
}
