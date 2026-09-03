import { toCents } from './money';
import { getOrderLabel } from './orderLabel';
import { computeKpis } from './kpis';
import { buildXlsx, downloadXlsx, type MoneyCell, type XlsxSheet } from './xlsxWriter';
import type { Order, ReportsSummary } from '../types';

interface Period {
  label: string;
  from: Date;
  to: Date;
}

const sanitizeFilenamePart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const reais = (cents: number) => cents / 100;
const money = (cents: number): MoneyCell => ({ value: reais(cents), format: 'money' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const STATUS_PT: Record<string, string> = {
  AGUARDANDO: 'Aguardando', PREPARANDO: 'Preparando', PRONTO: 'Pronto',
  EM_ROTA: 'Em rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
const TYPE_PT: Record<string, string> = { MESA: 'Mesa', RETIRADA: 'Retirada', DELIVERY: 'Delivery' };
const PAYMENT_PT: Record<string, string> = { DINHEIRO: 'Dinheiro', PIX: 'Pix', CREDITO: 'Crédito', DEBITO: 'Débito' };

// Aba "Resumo" -- mesmos 4 KPIs da tela e do PDF (computeKpis / /reports/summary),
// pra planilha, tela e PDF nunca divergirem.
function resumoSheet(
  kpis: { faturamentoCents: number; deliveredCount: number; ticketMedioCents: number; cancelledCount: number },
  period: Period,
): XlsxSheet {
  return {
    name: 'Resumo',
    columnWidths: [26, 40],
    rows: [
      ['Métrica', 'Valor'],
      ['Período', `${period.label} (${period.from.toLocaleDateString('pt-BR')} a ${period.to.toLocaleDateString('pt-BR')})`],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Faturamento bruto', money(kpis.faturamentoCents)],
      ['Pedidos entregues', kpis.deliveredCount],
      ['Ticket médio', money(kpis.ticketMedioCents)],
      ['Cancelamentos', kpis.cancelledCount],
    ],
  };
}

// Modo "Resumo": só os agregados de /reports/summary. Sem pedido individual.
export async function generateSummaryReportXlsx(summary: ReportsSummary, period: Period): Promise<void> {
  const sheets: XlsxSheet[] = [
    resumoSheet(summary, period),
    {
      name: 'Série temporal',
      columnWidths: [22, 18, 12, 12],
      moneyColumns: [1],
      rows: [
        ['Período', 'Faturamento', 'Entregues', 'Cancelados'],
        ...summary.series.map((p) => [fmtDateTime(p.bucket), reais(p.faturamentoCents), p.deliveredCount, p.cancelledCount]),
      ],
    },
    {
      name: 'Top 10 itens',
      columnWidths: [6, 40, 12],
      rows: [
        ['Nº', 'Item', 'Quantidade'],
        ...summary.topItems.map((item, idx) => [idx + 1, item.name, item.quantity]),
      ],
    },
  ];

  const bytes = await buildXlsx(sheets);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(bytes, `bebs_relatorio_resumo_${sanitizeFilenamePart(period.label)}_${stamp}.xlsx`);
}

function describeItem(item: Order['items'][number]): string {
  let s = `${item.quantity}x ${item.menuItemName}`;
  if (item.selectedChoice) s += ` (${item.selectedChoice})`;
  if (item.extras.length > 0) s += ` + ${item.extras.map((e) => `${e.quantity}x ${e.menuItemName}`).join(', ')}`;
  if (item.observations) s += ` [obs: ${item.observations}]`;
  return s;
}

// Modo "Completo": KPIs + uma linha por pedido + uma linha por item de pedido
// (a aba "Itens" existe pra tabela dinâmica: quantidade por item, por dia,
// por tipo -- coisa que a lista de pedidos sozinha não permite).
export async function generateOrderReportXlsx(orders: Order[], period: Period): Promise<void> {
  const kpis = computeKpis(orders);

  const pedidosRows = orders.map((o) => [
    o.id,
    getOrderLabel(o),
    TYPE_PT[o.type] ?? o.type,
    STATUS_PT[o.status] ?? o.status,
    PAYMENT_PT[o.paymentMethod] ?? o.paymentMethod,
    reais(toCents(o.subtotal)),
    o.deliveryFeeSnapshot ? reais(toCents(o.deliveryFeeSnapshot)) : 0,
    reais(toCents(o.total)),
    o.cashPaidAmount ? reais(toCents(o.cashPaidAmount)) : null,
    fmtDateTime(o.createdAt),
    o.neighborhoodNameSnapshot ?? '',
    o.createdByName ?? (o.clientOnline ? 'Cliente (site/WhatsApp)' : ''),
    o.assignedToName ?? '',
    o.items.map(describeItem).join('; '),
  ]);

  const itensRows = orders.flatMap((o) =>
    o.items.map((item) => [
      o.id,
      fmtDateTime(o.createdAt),
      STATUS_PT[o.status] ?? o.status,
      item.menuItemName,
      item.selectedChoice ?? '',
      item.quantity,
      reais(toCents(item.unitPrice)),
      item.extras.map((e) => `${e.quantity}x ${e.menuItemName}`).join(', '),
      item.observations ?? '',
    ]),
  );

  const sheets: XlsxSheet[] = [
    resumoSheet(kpis, period),
    {
      name: 'Pedidos',
      columnWidths: [8, 28, 10, 12, 10, 12, 12, 12, 12, 20, 22, 20, 16, 60],
      moneyColumns: [5, 6, 7, 8],
      rows: [
        ['Nº', 'Identificação', 'Tipo', 'Status', 'Pagamento', 'Subtotal', 'Taxa entrega', 'Total', 'Pago em dinheiro', 'Criado em', 'Bairro', 'Lançado por', 'Entregador', 'Itens'],
        ...pedidosRows,
      ],
    },
    {
      name: 'Itens',
      columnWidths: [8, 20, 12, 30, 18, 8, 12, 30, 40],
      moneyColumns: [6],
      rows: [
        ['Pedido', 'Criado em', 'Status', 'Item', 'Escolha', 'Qtd', 'Preço unit.', 'Acréscimos', 'Observações'],
        ...itensRows,
      ],
    },
  ];

  const bytes = await buildXlsx(sheets);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(bytes, `bebs_relatorio_${sanitizeFilenamePart(period.label)}_${stamp}.xlsx`);
}
