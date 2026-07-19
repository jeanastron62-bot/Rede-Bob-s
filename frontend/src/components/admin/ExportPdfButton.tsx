import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { generateOrderReportPdf, estimateOrderReportPages } from '../../utils/orderReportPdf';
import { generateSummaryReportPdf } from '../../utils/summaryReportPdf';
import type { Order, ReportsSummary } from '../../types';

interface ExportPdfButtonProps {
  range: { from: Date; to: Date };
  periodLabel: string;
}

interface OrdersPage {
  data: Order[];
  meta: { limit: number; offset: number; total: number; hasMore: boolean };
}

const PAGE_SIZE = 200;
const COMPLETO_CONFIRM_THRESHOLD = 1500;
const COMPLETO_MAX = 5000;

// Busca todos os pedidos do período paginando via GET /orders?limit=&offset=
// -- nunca num request só. Reporta progresso a cada página pro modal mostrar.
async function fetchAllOrdersPaginated(
  range: { from: Date; to: Date },
  onProgress: (fetched: number, total: number) => void,
): Promise<Order[]> {
  const orders: Order[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const { data } = await api.get<OrdersPage>('/orders', {
      params: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        limit: PAGE_SIZE,
        offset,
      },
    });
    orders.push(...data.data);
    total = data.meta.total;
    offset += data.data.length;
    onProgress(orders.length, total);
    if (data.data.length === 0) break;
  }

  return orders;
}

export function ExportPdfButton({ range, periodLabel }: ExportPdfButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [confirmingCompleto, setConfirmingCompleto] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = () => {
    setModalOpen(true);
    setConfirmingCompleto(false);
    setError(null);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);
    api.get<ReportsSummary>('/reports/summary', {
      params: { from: range.from.toISOString(), to: range.to.toISOString(), granularity: 'day' },
    })
      .then(({ data }) => setSummary(data))
      .catch((err) => setSummaryError(err.response?.data?.error || 'Erro ao carregar dados do período.'))
      .finally(() => setSummaryLoading(false));
  };

  const closeModal = () => {
    if (generating) return;
    setModalOpen(false);
  };

  const handleResumo = async () => {
    if (!summary) return;
    setGenerating(true);
    setError(null);
    try {
      await generateSummaryReportPdf(summary, { label: periodLabel, from: range.from, to: range.to });
      setModalOpen(false);
    } catch {
      setError('Erro ao gerar o PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCompleto = async () => {
    setGenerating(true);
    setError(null);
    setProgress({ fetched: 0, total: summary?.deliveredCount ?? 0 });
    try {
      const orders = await fetchAllOrdersPaginated(range, (fetched, total) => setProgress({ fetched, total }));
      await generateOrderReportPdf(orders, { label: periodLabel, from: range.from, to: range.to });
      setModalOpen(false);
    } catch {
      setError('Erro ao gerar o PDF.');
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  };

  const deliveredCount = summary?.deliveredCount ?? 0;
  const completoDisabled = deliveredCount > COMPLETO_MAX;
  const completoNeedsConfirm = deliveredCount >= COMPLETO_CONFIRM_THRESHOLD && deliveredCount <= COMPLETO_MAX;

  return (
    <>
      <Button variant="secondary" size="md" onClick={openModal}>
        <FileDown size={16} className="inline -mt-0.5 mr-1" /> Exportar PDF
      </Button>

      <Modal open={modalOpen} onClose={closeModal} title="Exportar relatório em PDF">
        <div className="flex flex-col gap-4">
          {summaryLoading && <p className="text-neutral-500">Carregando dados do período...</p>}
          {summaryError && (
            <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{summaryError}</p>
          )}

          {summary && !generating && (
            <>
              <div className="rounded-xl bg-neutral-900 border border-neutral-850 p-3 text-sm text-neutral-300">
                <p>
                  <strong className="text-white">Resumo</strong> — KPIs, série temporal e top 10 itens. Sem lista de
                  pedidos individuais. Sempre disponível.
                </p>
              </div>
              <Button variant="primary" size="md" onClick={handleResumo}>Gerar Resumo</Button>

              <div className="rounded-xl bg-neutral-900 border border-neutral-850 p-3 text-sm text-neutral-300">
                <p>
                  <strong className="text-white">Completo</strong> — inclui a tabela pedido a pedido (
                  {deliveredCount} pedidos entregues no período).
                </p>
              </div>

              {completoDisabled && (
                <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">
                  Modo Completo desabilitado: {deliveredCount} pedidos entregues excede o limite de {COMPLETO_MAX}.
                  Reduza o período.
                </p>
              )}

              {!completoDisabled && !confirmingCompleto && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => (completoNeedsConfirm ? setConfirmingCompleto(true) : handleCompleto())}
                >
                  Gerar Completo
                </Button>
              )}

              {!completoDisabled && confirmingCompleto && (
                <div className="flex flex-col gap-2 rounded-xl bg-amber-950/30 border border-amber-900/50 p-3">
                  <p className="text-sm text-amber-200">
                    {deliveredCount} pedidos entregues no período — estimativa de ~{estimateOrderReportPages(deliveredCount)}{' '}
                    páginas. Isso pode demorar. Confirma a geração?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" size="md" onClick={handleCompleto}>Confirmar e gerar</Button>
                    <Button variant="ghost" size="md" onClick={() => setConfirmingCompleto(false)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {generating && (
            <p className="text-neutral-300">
              {progress ? `Buscando pedidos... ${progress.fetched}/${progress.total}` : 'Gerando PDF...'}
            </p>
          )}

          {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
