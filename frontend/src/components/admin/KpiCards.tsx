import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { toCents, formatMoney } from '../../utils/money';
import type { Order } from '../../types';

interface KpiCardsProps {
  from: Date;
  to: Date;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export function KpiCards({ from, to }: KpiCardsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<Order[]>('/orders', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then(({ data }) => { if (!cancelled) setOrders(data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Erro ao carregar pedidos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (loading) return <p className="text-white/60">Carregando...</p>;
  if (error) return <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>;

  const delivered = orders.filter((o) => o.status === 'ENTREGUE');
  const cancelled = orders.filter((o) => o.status === 'CANCELADO');
  const faturamentoCents = delivered.reduce((sum, o) => sum + toCents(o.total), 0);
  const ticketMedioCents = delivered.length > 0 ? Math.round(faturamentoCents / delivered.length) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="Faturamento Bruto" value={formatMoney(faturamentoCents)} />
      <Card label="Pedidos Entregues" value={String(delivered.length)} />
      <Card label="Ticket Médio" value={formatMoney(ticketMedioCents)} />
      <Card label="Cancelamentos" value={String(cancelled.length)} />
    </div>
  );
}
