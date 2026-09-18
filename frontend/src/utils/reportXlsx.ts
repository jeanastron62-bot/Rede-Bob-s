import { toCents } from './money';
import { buildXlsx, downloadXlsx, type CellValue, type XlsxSheet } from './xlsxWriter';
import type { Order, ReportsSummary } from '../types';

interface Period {
  label: string;
  from: Date;
  to: Date;
}

const sanitizeFilenamePart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const stamp = () => new Date().toISOString().slice(0, 10);

// Dinheiro vive em centavos no frontend inteiro (regra do projeto: nunca
// float em caminho de dinheiro). Só vira reais aqui, na borda, e como NÚMERO
// com formato de moeda -- planilha com dinheiro em texto não soma.
const money = (cents: number): CellValue => ({ t: 'money', v: cents / 100 });
const int = (n: number): CellValue => ({ t: 'int', v: n });
const dt = (iso: string): CellValue => ({ t: 'datetime', v: new Date(iso) });

const STATUS_PT: Record<string, string> = {
  AGUARDANDO: 'Aguardando', PREPARANDO: 'Preparando', PRONTO: 'Pronto',
  EM_ROTA: 'Em rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
const TYPE_PT: Record<string, string> = { MESA: 'Mesa', RETIRADA: 'Retirada', DELIVERY: 'Delivery' };
const PAYMENT_PT: Record<string, string> = { DINHEIRO: 'Dinheiro', PIX: 'Pix', CREDITO: 'Crédito', DEBITO: 'Débito' };

// ---------------------------------------------------------------------------
// MODO COMPLETO -- despejo bruto, uma linha por registro, zero agregação.
//
// Três abas espelhando as três tabelas do banco (orders, order_items,
// order_item_extras), ligadas pelo número do pedido. É o formato que serve
// tanto pra conferência manual quanto pra tabela dinâmica: nenhuma célula
// esconde informação dentro de um texto concatenado.
//
// As poucas colunas calculadas (troco, total da linha, contagens) ficam no
// fim de cada aba e estão marcadas no cabeçalho. Elas acrescentam, nunca
// substituem um dado cru.
// ---------------------------------------------------------------------------

// Fórmula oficial do projeto (CONTEXTO 5.1): os acréscimos multiplicam pela
// quantidade do item. "2x X-Burguer com bacon" cobra dois bacons.
function lineTotalCents(item: Order['items'][number]): number {
  const extras = item.extras.reduce((sum, e) => sum + toCents(e.unitPrice) * e.quantity, 0);
  return (toCents(item.unitPrice) + extras) * item.quantity;
}

function pedidosSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'Tipo', 'Status', 'Mesa', 'Cliente', 'Telefone', 'Endereço',
    'Bairro', 'ID do bairro', 'Taxa de entrega', 'Subtotal', 'Total',
    'Forma de pagamento', 'Pago em dinheiro', 'Troco (calculado)',
    'Lançado por', 'ID de quem lançou', 'Entregador', 'ID do entregador',
    'Pedido online', 'Aguarda confirmação', 'Ocorrência',
    'Criado em', 'Atualizado em', 'Qtd. de itens (calculado)',
  ];

  const rows = orders.map((o) => {
    const totalCents = toCents(o.total);
    const pagoCents = o.cashPaidAmount ? toCents(o.cashPaidAmount) : null;
    const trocoCents = pagoCents !== null ? pagoCents - totalCents : null;
    return [
      int(o.id),
      TYPE_PT[o.type] ?? o.type,
      STATUS_PT[o.status] ?? o.status,
      o.tableNumber !== null && o.tableNumber !== undefined ? int(o.tableNumber) : null,
      o.customerName ?? null,
      o.customerPhone ?? null,
      o.customerAddress ?? null,
      o.neighborhoodNameSnapshot ?? null,
      o.neighborhoodId !== null && o.neighborhoodId !== undefined ? int(o.neighborhoodId) : null,
      o.deliveryFeeSnapshot ? money(toCents(o.deliveryFeeSnapshot)) : null,
      money(toCents(o.subtotal)),
      money(totalCents),
      PAYMENT_PT[o.paymentMethod] ?? o.paymentMethod,
      pagoCents !== null ? money(pagoCents) : null,
      trocoCents !== null ? money(trocoCents) : null,
      o.createdByName ?? null,
      o.createdById !== null && o.createdById !== undefined ? int(o.createdById) : null,
      o.assignedToName ?? null,
      o.assignedToId !== null && o.assignedToId !== undefined ? int(o.assignedToId) : null,
      o.clientOnline,
      o.requiresStaffConfirmation,
      o.problems ?? null,
      dt(o.createdAt),
      dt(o.updatedAt),
      int(o.items.length),
    ];
  });

  return {
    name: 'Pedidos',
    columnWidths: [13, 10, 12, 7, 24, 16, 38, 22, 11, 14, 12, 12, 17, 15, 15, 20, 15, 20, 15, 13, 18, 34, 18, 18, 18],
    rows: [header, ...rows],
  };
}

function itensSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'ID do item', 'ID do produto', 'Produto', 'Escolha obrigatória',
    'Quantidade', 'Preço unitário', 'Qtd. de acréscimos', 'Total da linha (calculado)',
    'Observações', 'Tipo do pedido', 'Status do pedido', 'Pedido criado em',
  ];

  const rows = orders.flatMap((o) =>
    o.items.map((item) => [
      int(o.id),
      int(item.id),
      int(item.menuItemId),
      item.menuItemName,
      item.selectedChoice ?? null,
      int(item.quantity),
      money(toCents(item.unitPrice)),
      int(item.extras.length),
      money(lineTotalCents(item)),
      item.observations ?? null,
      TYPE_PT[o.type] ?? o.type,
      STATUS_PT[o.status] ?? o.status,
      dt(o.createdAt),
    ]),
  );

  return {
    name: 'Itens do pedido',
    columnWidths: [13, 11, 13, 30, 20, 11, 14, 17, 22, 40, 13, 14, 18],
    rows: [header, ...rows],
  };
}

function acrescimosSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'ID do item', 'Produto do item', 'ID do acréscimo', 'ID do produto',
    'Acréscimo', 'Qtd. do acréscimo', 'Qtd. do item', 'Preço unitário',
    'Total no pedido (calculado)', 'Pedido criado em',
  ];

  const rows = orders.flatMap((o) =>
    o.items.flatMap((item) =>
      item.extras.map((extra) => [
        int(o.id),
        int(item.id),
        item.menuItemName,
        int(extra.id),
        int(extra.menuItemId),
        extra.menuItemName,
        int(extra.quantity),
        int(item.quantity),
        money(toCents(extra.unitPrice)),
        // Multiplica pela quantidade do item, como manda a regra de cálculo.
        money(toCents(extra.unitPrice) * extra.quantity * item.quantity),
        dt(o.createdAt),
      ]),
    ),
  );

  return {
    name: 'Acréscimos',
    columnWidths: [13, 11, 30, 15, 13, 24, 17, 13, 14, 24, 18],
    rows: [header, ...rows],
  };
}

export async function generateOrderReportXlsx(orders: Order[], period: Period): Promise<void> {
  const sheets: XlsxSheet[] = [
    pedidosSheet(orders),
    itensSheet(orders),
    acrescimosSheet(orders),
  ];
  const bytes = await buildXlsx(sheets);
  downloadXlsx(bytes, `bebs_pedidos_${sanitizeFilenamePart(period.label)}_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// MODO RESUMO -- só os agregados de /reports/summary, sem pedido individual.
// Funciona pra qualquer período, sem limite de tamanho.
// ---------------------------------------------------------------------------

export async function generateSummaryReportXlsx(summary: ReportsSummary, period: Period): Promise<void> {
  const fechados = summary.deliveredCount + summary.cancelledCount;
  const taxaCancelamento = fechados > 0 ? summary.cancelledCount / fechados : 0;

  const visaoGeral: XlsxSheet = {
    name: 'Visão geral',
    headerRow: false,
    columnWidths: [42, 26],
    rows: [
      [{ t: 'title', v: "Beb's Burguer — Relatório de vendas" }],
      [],
      ['Período', period.label],
      ['De', { t: 'date', v: period.from }],
      ['Até', { t: 'date', v: period.to }],
      ['Gerado em', { t: 'datetime', v: new Date() }],
      [],
      [{ t: 'header', v: 'Indicador' }, { t: 'header', v: 'Valor' }],
      ['Faturamento (só pedidos entregues)', money(summary.faturamentoCents)],
      ['Pedidos entregues', int(summary.deliveredCount)],
      ['Ticket médio por pedido entregue', money(summary.ticketMedioCents)],
      ['Pedidos cancelados', int(summary.cancelledCount)],
      ['Taxa de cancelamento', { t: 'percent', v: taxaCancelamento }],
      [],
      [{ t: 'title', v: 'Como ler estes números' }],
      ['Faturamento conta apenas pedidos com status Entregue. Pedido em preparo, pronto ou cancelado não entra na conta.'],
      ['Ticket médio é o faturamento dividido pelo número de pedidos entregues.'],
      ['Taxa de cancelamento é cancelados dividido por entregues mais cancelados.'],
      ['A aba "Por dia" usa o expediente, que vai das 12:00 às 11:59 do dia seguinte. Um pedido da 01:30 pertence ao dia anterior.'],
      ['A aba "Itens mais vendidos" conta apenas itens de pedidos entregues.'],
      ['Para a lista pedido a pedido, com todas as colunas, use a exportação Completo.'],
    ],
  };

  const porDia: XlsxSheet = {
    name: 'Por dia',
    columnWidths: [14, 16, 20, 20, 18],
    rows: [
      ['Data', 'Faturamento', 'Pedidos entregues', 'Pedidos cancelados', 'Ticket médio'],
      ...summary.series.map((p) => [
        { t: 'date' as const, v: new Date(p.bucket) },
        money(p.faturamentoCents),
        int(p.deliveredCount),
        int(p.cancelledCount),
        p.deliveredCount > 0 ? money(Math.round(p.faturamentoCents / p.deliveredCount)) : null,
      ]),
    ],
  };

  const totalListado = summary.topItems.reduce((sum, i) => sum + i.quantity, 0);
  const itensMaisVendidos: XlsxSheet = {
    name: 'Itens mais vendidos',
    columnWidths: [10, 38, 20, 22],
    rows: [
      ['Posição', 'Item', 'Quantidade vendida', '% dos itens listados'],
      ...summary.topItems.map((item, idx) => [
        int(idx + 1),
        item.name,
        int(item.quantity),
        totalListado > 0 ? { t: 'percent' as const, v: item.quantity / totalListado } : null,
      ]),
    ],
  };

  const bytes = await buildXlsx([visaoGeral, porDia, itensMaisVendidos]);
  downloadXlsx(bytes, `bebs_resumo_${sanitizeFilenamePart(period.label)}_${stamp()}.xlsx`);
}
