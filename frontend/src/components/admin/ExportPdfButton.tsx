import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { generateOrderReportPdf } from '../../utils/orderReportPdf';
import type { Order } from '../../types';

interface ExportPdfButtonProps {
  range: { from: Date; to: Date };
  periodLabel: string;
}

export function ExportPdfButton({ range, periodLabel }: ExportPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca so no clique (mesmo endpoint/params do KpiCards) e formata via o
  // mesmo computeKpis -- nao recalcula nada, so exporta o que a tela ja mostra.
  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.get<Order[]>('/orders', {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      await generateOrderReportPdf(data, { label: periodLabel, from: range.from, to: range.to });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar o PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="md" onClick={handleExport} disabled={busy}>
        <FileDown size={16} className="inline -mt-0.5 mr-1" /> {busy ? 'Gerando...' : 'Exportar PDF'}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
