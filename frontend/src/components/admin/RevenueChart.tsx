import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../services/api';
import { toCents, formatMoney } from '../../utils/money';
import type { Order } from '../../types';

interface RevenueChartProps {
  from: Date;
  to: Date;
}

// Expediente vai das 18h as 05h, atravessando a meia-noite -- ordem cronologica
// do turno, nao a ordem numerica de 0-23.
const SHIFT_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

interface HourBucket {
  hour: number;
  hourLabel: string;
  revenueCents: number;
  orders: { id: number; label: string; totalCents: number }[];
}

function orderLabel(o: Order): string {
  if (o.type === 'MESA') return `Mesa ${o.tableNumber}`;
  return o.customerName || `Pedido #${o.id}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const bucket: HourBucket = payload[0].payload;
  if (bucket.orders.length === 0) return null;
  return (
    <div className="rounded-xl border border-neutral-850 bg-neutral-950 p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-white">{bucket.hourLabel} — {formatMoney(bucket.revenueCents)}</p>
      <ul className="flex flex-col gap-0.5 text-neutral-400">
        {bucket.orders.map((o) => (
          <li key={o.id}>{o.label}: {formatMoney(o.totalCents)}</li>
        ))}
      </ul>
    </div>
  );
}

export function RevenueChart({ from, to }: RevenueChartProps) {
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

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (error) return <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>;

  const buckets: HourBucket[] = SHIFT_HOURS.map((hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, '0')}h`,
    revenueCents: 0,
    orders: [],
  }));

  for (const order of orders) {
    if (order.status !== 'ENTREGUE') continue;
    const hour = new Date(order.createdAt).getHours();
    const bucket = buckets.find((b) => b.hour === hour);
    if (!bucket) continue;
    const totalCents = toCents(order.total);
    bucket.revenueCents += totalCents;
    bucket.orders.push({ id: order.id, label: orderLabel(order), totalCents });
  }

  return (
    <div className="rounded-2xl bg-neutral-950 border border-neutral-850 p-4">
      <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500">Faturamento por hora do expediente</p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={buckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
            <XAxis dataKey="hourLabel" stroke="#ffffff80" fontSize={12} />
            <YAxis stroke="#ffffff80" fontSize={12} tickFormatter={(v) => formatMoney(v)} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="revenueCents" stroke="#f97316" fill="#f9731633" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
