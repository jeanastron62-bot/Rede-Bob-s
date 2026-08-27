import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { listItems } from '../menu/menu.service';
import { getConfig } from '../config/config.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { createLog } from '../../utils/logger';
import { getIO } from '../../socket/socket';
import { computeDeliveryGrace } from '../../utils/deliveryWindow';

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

// Fase 15.1 -- quem diz do que trata um webhook é o `change.field`, não o
// formato do `value`. Enquanto o app só assinava `messages`, decidir por
// "tem value.messages?" funcionava por sorte; com a coexistência ligada
// chegam, no mesmo POST e no mesmo endpoint, payloads de estrutura
// completamente diferente (`history`, `smb_app_state_sync`) -- procurar
// `value.messages` neles dá undefined silencioso na melhor hipótese.
export const WEBHOOK_FIELD = {
  MESSAGES: 'messages',
  MESSAGE_ECHOES: 'smb_message_echoes',
  ACCOUNT_UPDATE: 'account_update',
  HISTORY: 'history',
  APP_STATE_SYNC: 'smb_app_state_sync',
} as const;

interface WebhookChangeValue {
  messages?: InboundMessage[];
  // Fase 15.4 -- mensagens que o negócio mandou pelo app WhatsApp Business,
  // espelhadas pro webhook (chegam sob o field smb_message_echoes).
  message_echoes?: MessageEcho[];
  // Fase 15.3 -- de qual número da WABA esta mensagem chegou. É por este
  // campo (não por "pega a conta ativa") que sendMessage.ts decide com qual
  // WhatsappBusinessAccount responder.
  metadata?: { phone_number_id?: string };
  // account_update: é aqui que o Meta avisa que a conexão morreu
  // (desconexão pelo celular, remoção do parceiro, offboarding).
  event?: string;
  disconnection_info?: unknown;
  // history / smb_app_state_sync: só a contagem é usada, o conteúdo é
  // descartado de propósito (ver routeWebhookChanges).
  history?: unknown[];
  state_sync?: unknown[];
  // statuses (recibos de entrega/leitura) chegam sob o field 'messages' e
  // continuam ignorados desde a Fase 13 -- não são mensagem recebida.
}

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: WebhookChangeValue;
    }>;
  }>;
}

// Só estes dois significam "acabou": os outros account_update (mudança de
// nome, de limite, de qualidade) não afetam o funcionamento do bot.
const DISCONNECTION_EVENTS = new Set(['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED']);

// Nunca tenta reconectar sozinho: reconexão passa pelo Embedded Signup com o
// Facebook da dona dentro do popup, coisa que handler de webhook nenhum
// consegue refazer. O que dá pra fazer é a desconexão não passar em
// silêncio -- fica em Log, que o painel já lista, com o disconnection_info
// inteiro pra quem for investigar depois.
async function handleAccountUpdate(value: WebhookChangeValue): Promise<void> {
  const event = typeof value.event === 'string' ? value.event : null;
  console.log('[WHATSAPP_ACCOUNT_UPDATE]', { event });
  if (!event || !DISCONNECTION_EVENTS.has(event)) return;

  await createLog(prisma, {
    username: 'Meta (webhook)',
    action: 'WHATSAPP_DISCONNECTED',
    details: { event, disconnectionInfo: value.disconnection_info ?? null },
  });
  console.error('[WHATSAPP_DISCONNECTED]', { event });
}

// Contagem defensiva: o payload de history é aninhado (history[] -> threads[]
// -> messages[]) e vem do Meta, não daqui -- qualquer nível pode não ser array.
function countHistory(value: WebhookChangeValue): { threads: number; messages: number } {
  let threads = 0;
  let messages = 0;
  for (const chunk of Array.isArray(value.history) ? value.history : []) {
    const threadList = (chunk as { threads?: unknown }).threads;
    for (const thread of Array.isArray(threadList) ? threadList : []) {
      threads += 1;
      const messageList = (thread as { messages?: unknown }).messages;
      messages += Array.isArray(messageList) ? messageList.length : 0;
    }
  }
  return { threads, messages };
}

// Fase 15.1 -- porta de entrada única do webhook: um percurso só do payload,
// com switch explícito no field, devolvendo o que o loop de resposta em
// receive() precisa. Substitui extractMessages/extractMessageEchoes, que
// percorriam o mesmo payload de novo cada uma e não olhavam o field.
export async function routeWebhookChanges(payload: WhatsappWebhookPayload): Promise<{
  messages: Array<InboundMessage & { phoneNumberId?: string }>;
  echoes: MessageEcho[];
}> {
  const messages: Array<InboundMessage & { phoneNumberId?: string }> = [];
  const echoes: MessageEcho[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      switch (change.field) {
        case WEBHOOK_FIELD.MESSAGES: {
          const phoneNumberId = value.metadata?.phone_number_id;
          for (const message of value.messages ?? []) {
            messages.push({ ...message, phoneNumberId });
          }
          break;
        }
        case WEBHOOK_FIELD.MESSAGE_ECHOES: {
          for (const echo of value.message_echoes ?? []) {
            echoes.push(echo);
          }
          break;
        }
        case WEBHOOK_FIELD.ACCOUNT_UPDATE:
          await handleAccountUpdate(value);
          break;
        case WEBHOOK_FIELD.HISTORY:
          // Descartado de propósito: um único webhook descreve meses de
          // conversa da dona com os clientes dela. Guardar isso é PII em
          // volume num banco cuja política de retenção (40 dias, ver
          // PROMPT.md) foi escrita pra conversa do bot, não pra importação
          // em massa. Importar antes de decidir a retenção é criar passivo;
          // se um dia for preciso, é fase própria.
          console.log('[WHATSAPP_HISTORY_DISCARDED]', countHistory(value));
          break;
        case WEBHOOK_FIELD.APP_STATE_SYNC:
          // Mesma decisão do history: a agenda de contatos da dona não entra
          // neste banco.
          console.log('[WHATSAPP_APP_STATE_SYNC_DISCARDED]', {
            entries: Array.isArray(value.state_sync) ? value.state_sync.length : 0,
          });
          break;
        default:
          // Nunca lança. Field desconhecido é campo novo do Meta ou campo
          // assinado no App Dashboard sem ninguém mexer aqui -- os dois têm
          // que virar log, não exceção: o Meta reentrega por até 36h quem
          // não devolve 200, e uma exceção aqui viraria fila de reentrega.
          console.warn('[WHATSAPP_WEBHOOK_UNKNOWN_FIELD]', { field: change.field ?? null });
      }
    }
  }

  return { messages, echoes };
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

// Quando o Meta diz que o cliente mandou a mensagem (unix em segundos, como
// string no payload). Usado no lugar do relógio de processamento pra decidir
// a tolerância de delivery: o Meta reentrega com backoff quando não recebe
// 200 a tempo, e uma mensagem das 23:59 processada às 00:0x é justamente
// quem a tolerância existe pra proteger. Cai pro relógio local se vier
// ausente ou ilegível -- nunca deixa a decisão sem instante nenhum.
export function extractMessageTimestamp(message: Record<string, unknown>, fallback: Date = new Date()): Date {
  const raw = message.timestamp;
  const seconds = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return new Date(seconds * 1000);
}

// Fase 15.5 -- sem transcrição de áudio nem visão computacional, o bot não
// tem o que responder de verdade pra esses tipos. Resposta fixa por tipo,
// nunca gasta chamada de OpenAI com um turno de usuário sem texto nenhum --
// foi exatamente isso que vazou raciocínio interno do modelo (turno vazio,
// nada pra responder) e gerou o fallback de erro genérico na foto.
export const NON_TEXT_REPLIES: Record<string, string> = {
  audio: 'Não consigo ouvir áudio por aqui ainda 🙏 Manda por texto que te atendo na hora!',
  image: 'Recebi sua foto, mas ainda não consigo analisar imagem por aqui. Me conta em texto o que você precisa 🙏',
  document: 'Não consigo abrir arquivo por aqui ainda. Pode me contar em texto?',
  sticker: 'Adorei o sticker! 😄 Mas preciso que escreva em texto pra eu te ajudar com o pedido.',
  location: 'Recebi sua localização, mas pra fechar o pedido preciso do endereço em texto (rua, número e bairro).',
  contacts: 'Recebi o contato, mas não consigo processar isso por aqui. Me conta em texto o que você precisa.',
};
export const NON_TEXT_REPLY_DEFAULT =
  'Não consigo processar esse tipo de mensagem por aqui ainda. Pode me escrever em texto o que você precisa?';

// Fase 14.8 -- exportada (antes era privada): o novo loop em receive() precisa
// dela pra saber em qual conversationId gravar/consultar, não só
// storeInboundMessages.
export async function findOrCreateConversation(phone: string, messageAt: Date = new Date()) {
  // Grace só é gravado quando computeDeliveryGrace devolve valor (mensagem
  // entre 18:00 e 23:59). Fora dessa faixa o campo fica de fora do update de
  // propósito -- sobrescrever com null às 00:05 apagaria exatamente a
  // tolerância que a mensagem das 23:5x concedeu.
  const deliveryGraceUntil = computeDeliveryGrace(messageAt);
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: { lastInboundAt: new Date(), ...(deliveryGraceUntil ? { deliveryGraceUntil } : {}) },
    create: { phone, lastInboundAt: new Date(), deliveryGraceUntil },
  });
}

// Recebe as mensagens já roteadas por routeWebhookChanges (Fase 15.1) em vez
// de navegar o payload de novo -- antes o mesmo payload era percorrido três
// vezes por requisição, e a navegação daqui não tinha como saber o field.
export async function storeInboundMessages(
  messages: Array<InboundMessage & { phoneNumberId?: string }>
): Promise<void> {
  for (const { phoneNumberId: _phoneNumberId, ...message } of messages) {
    // phoneNumberId é contexto adicionado por extractMessages (Fase 15.3),
    // não fazia parte do payload original do Meta -- não entra em
    // rawPayload, que precisa continuar sendo exatamente o que chegou.
    const conversation = await findOrCreateConversation(message.from, extractMessageTimestamp(message));

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
  // true só depois que o cliente confirmou o bairro de novo, já avisado da
  // divergência achada pelo ViaCEP -- sem essa válvula, insistir no mesmo
  // bairro reabre o mesmo erro pra sempre (checkBairroDivergente acha a
  // mesma divergência de novo a cada nova tentativa de criar_pedido).
  bairro_confirmado_pelo_cliente: boolean | null;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

const VIACEP_TIMEOUT_MS = 2500;

// Só pra comparar bairro do ViaCEP com o nosso cadastro -- normalizeName
// (trim + lowercase) não basta aqui: nosso cadastro tem sufixo tipo "1ª
// Seção"/"Setor Central" que o nome oficial dos Correios não tem, e teria
// acento/pontuação divergente mesmo quando é o mesmo bairro. NFKD decompõe
// tanto acento (é -> e + combining) quanto símbolo tipo ª/º (compatibility
// decomposition -> a/o) antes de remover o que sobrar; a continência nos
// dois sentidos casa "alterosa" com "alterosa 1a secao" e vice-versa.
function normalizeBairro(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bairroCorresponde(a: string, b: string): boolean {
  const normA = normalizeBairro(a);
  const normB = normalizeBairro(b);
  return normA.length > 0 && normB.length > 0 && (normA.includes(normB) || normB.includes(normA));
}

// Corta no primeiro número ou vírgula -- ViaCEP busca por logradouro, não
// aceita "Rua X, 326, apto 2", só "Rua X".
function extractLogradouro(endereco: string): string {
  const match = endereco.match(/^([^,\d]+)/);
  return (match ? match[1] : endereco).trim();
}

// Confere o bairro que o cliente informou contra o que o ViaCEP associa à
// rua digitada -- hoje a única validação de bairro é "esse nome existe na
// nossa lista", sem relação nenhuma com o endereço (foi assim que um pedido
// pra Rua Dirceu José Alvarenga, que fica em Betim Industrial, foi
// confirmado como "Alterosa 1ª Seção"). Devolve o bairro divergente
// encontrado, ou null se bateu / não achou a rua / a API falhou -- nunca
// bloqueia o pedido por causa disso, só evita, quando dá, um endereço
// errado passar sem pergunta nenhuma. Trailer só entrega em Betim/MG, não é
// validação de endereço genérica.
async function checkBairroDivergente(bairroInformado: string, endereco: string): Promise<string | null> {
  const logradouro = extractLogradouro(endereco);
  if (logradouro.length < 3) return null; // ViaCEP exige >= 3 caracteres de busca

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS);
  try {
    const url = `https://viacep.com.br/ws/MG/Betim/${encodeURIComponent(logradouro)}/json/`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const bairrosEncontrados: string[] = results
      .map((r: { bairro?: string }) => r.bairro)
      .filter((b: string | undefined): b is string => Boolean(b));
    if (bairrosEncontrados.length === 0) return null;
    if (bairrosEncontrados.some((b) => bairroCorresponde(b, bairroInformado))) return null;

    return bairrosEncontrados[0];
  } catch {
    return null; // timeout, rede fora, resposta inesperada -- nunca bloqueia por isso
  } finally {
    clearTimeout(timeout);
  }
}

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

    // Só roda a checagem se o cliente ainda não confirmou o bairro depois de
    // avisado -- sem isso, insistir no mesmo bairro reabre o mesmo erro pra
    // sempre (checkBairroDivergente acha a mesma divergência de novo a cada
    // nova tentativa de criar_pedido com os mesmos args).
    if (args.endereco && !args.bairro_confirmado_pelo_cliente) {
      const bairroDivergente = await checkBairroDivergente(neighborhood.name, args.endereco);
      if (bairroDivergente) {
        throw {
          status: 400,
          message: `O endereço '${args.endereco}' geralmente fica no bairro '${bairroDivergente}', não em '${args.bairro}'. Confirme com o cliente qual é o bairro certo antes de continuar.`,
        };
      }
    }
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
async function handleCriarPedido(args: CriarPedidoArgs, phone: string, conversationId: number): Promise<string> {
  try {
    const data = await resolveCriarPedidoData(args, phone);
    // Tolerância desta conversa (ver computeDeliveryGrace): sem repassar, o
    // prompt ofereceria delivery às 00:05 e o createOrder recusaria logo
    // depois -- o cliente montaria o pedido inteiro pra tomar erro no fim.
    const conversation = await prisma.whatsappConversation.findUnique({ where: { id: conversationId } });
    const order = await ordersService.createOrder(
      data,
      undefined,
      'Cliente (WhatsApp)',
      true,
      conversation?.deliveryGraceUntil ?? null
    );
    return JSON.stringify({ sucesso: true, numero_pedido: order.id, total: Number(order.total) });
  } catch (err: any) {
    const message = err?.message ?? 'Não foi possível criar o pedido agora.';
    console.error('[WHATSAPP_BOT_CRIAR_PEDIDO_FAILED]', { phone, args, error: err });
    return JSON.stringify({ sucesso: false, erro: message });
  }
}

interface CancelarPedidoAtivoArgs {
  numero_pedido: number;
  motivo: string;
}

// Nunca o "mais recente" -- ver nota de 2.1 do PROMPT.md: nada garante que o
// telefone tem só um pedido em aberto (ex.: um PRONTO do site + um
// AGUARDANDO do bot no mesmo telefone). O system prompt lista todos e
// pergunta qual, em vez de assumir.
async function handleConsultarPedidoAtivo(phone: string): Promise<string> {
  try {
    const orders = await ordersService.findActiveOrdersByPhone(phone);
    return JSON.stringify({
      pedidos: orders.map((o) => ({
        numero_pedido: o.id,
        status: o.status,
        tipo: o.type,
        total: Number(o.total),
      })),
    });
  } catch (err: any) {
    console.error('[WHATSAPP_BOT_CONSULTAR_PEDIDO_FAILED]', { phone, error: err });
    return JSON.stringify({ pedidos: [], erro: 'Não foi possível consultar seus pedidos agora.' });
  }
}

async function handleCancelarPedidoAtivo(args: CancelarPedidoAtivoArgs, phone: string): Promise<string> {
  const numeroPedido = Number(args.numero_pedido);
  const motivo = typeof args.motivo === 'string' && args.motivo.trim() ? args.motivo : 'Não informado';

  if (!Number.isInteger(numeroPedido)) {
    return JSON.stringify({ sucesso: false, erro: 'Número de pedido inválido.' });
  }

  try {
    const order = await ordersService.cancelActiveOrderByCustomer(numeroPedido, phone, motivo);
    return JSON.stringify({ sucesso: true, numero_pedido: order.id });
  } catch (err: any) {
    const message = err?.message ?? 'Não foi possível cancelar o pedido agora.';
    console.error('[WHATSAPP_BOT_CANCELAR_PEDIDO_FAILED]', { phone, numeroPedido, error: err });
    // Fase 16 -- o contato vai junto na resposta da FUNÇÃO, não fica só na
    // instrução do prompt ("passe o contato {{CONTATO_TELEFONE}}"). Recusa é
    // o único momento em que o cliente fica sem saída: se o modelo esquecer
    // de anexar o telefone, ele descobre que não dá pra cancelar e não tem
    // pra quem ligar. Instrução de prompt é probabilística; isto não é.
    const config = await getConfig().catch(() => null);
    return JSON.stringify({
      sucesso: false,
      erro: message,
      contato_do_trailer: config?.contactPhone || null,
      instrucao: 'Diga ao cliente exatamente este motivo e passe o contato do trailer. Não ofereça tentar de novo.',
    });
  }
}

export async function dispatchToolCall(
  name: string,
  args: Record<string, unknown>,
  conversationId: number,
  phone: string
): Promise<string> {
  if (name === 'criar_pedido') {
    return handleCriarPedido(args as unknown as CriarPedidoArgs, phone, conversationId);
  }

  if (name === 'consultar_pedido_ativo') {
    return handleConsultarPedidoAtivo(phone);
  }

  if (name === 'cancelar_pedido_ativo') {
    return handleCancelarPedidoAtivo(args as unknown as CancelarPedidoAtivoArgs, phone);
  }

  if (name === 'transferir_para_humano') {
    const motivo = typeof args.motivo === 'string' ? args.motivo : null;
    const resumo = typeof args.resumo === 'string' ? args.resumo : null;

    await prisma.whatsappConversation.update({
      where: { id: conversationId },
      data: { botPaused: true, handoffMotivo: motivo, handoffResumo: resumo },
    });

    // Sem isso a pausa fica invisível: só existia console.log (stdout do
    // Railway, ninguém olha proativamente) e nada no painel. createLog dá
    // auditoria em /logs; o emit dá alerta em tempo real pra quem está com
    // o painel aberto (mesmo padrão de order:created em orders.service.ts).
    await createLog(prisma, {
      username: 'Bot WhatsApp',
      action: 'WHATSAPP_HANDOFF',
      details: { conversationId, phone, motivo, resumo },
    });
    getIO().of('/staff').emit('whatsapp:handoff', { conversationId, phone, motivo, resumo });

    console.log('[WHATSAPP_BOT_HANDOFF]', { conversationId, motivo, resumo });
    // Resultado da tool, não texto final -- o controller manda de volta pra
    // OpenAI, que já sabe (system prompt) o que dizer nesse caso.
    return JSON.stringify({ sucesso: true });
  }

  console.log('[WHATSAPP_BOT_STUB_CALL]', { conversationId, name, args });
  return 'Isso ainda está sendo configurado por aqui -- já te chamamos assim que possível.';
}

// Fase 14.7 -- destrava conversa pausada por transferir_para_humano.
export async function resumeConversation(conversationId: number) {
  return prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: { botPaused: false, handoffMotivo: null, handoffResumo: null },
  });
}

// Caixa de entrada do painel -- conversas paradas esperando atendente,
// mais recentes primeiro.
export async function getPausedConversations() {
  return prisma.whatsappConversation.findMany({
    where: { botPaused: true },
    orderBy: { updatedAt: 'desc' },
  });
}
