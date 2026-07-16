import { getOrderLabel } from '../../utils/orderLabel';
import { formatMoneyFromString } from '../../utils/money';
import type { Order, OrderStatus } from '../../types';

const STATUS_COLORS: Record<OrderStatus, string> = { AGUARDANDO: 'bg-yellow-600', PREPARANDO: 'bg-blue-600', PRONTO: 'bg-green-600', EM_ROTA: 'bg-purple-600', ENTREGUE: 'bg-white/20', CANCELADO: 'bg-red-800' };
const STATUS_LABELS: Record<OrderStatus, string> = { AGUARDANDO: 'Aguardando', PREPARANDO: 'Preparando', PRONTO: 'Pronto', EM_ROTA: 'Em Rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' };

interface OrderCardProps {
  order: Order;
  onCancelClick: (order: Order) => void;
}

export function OrderCard({ order, onCancelClick }: OrderCardProps) {
  const canCancel = order.status !== 'ENTREGUE' && order.status !== 'CANCELADO';

  return (
    <div className="rounded-xl bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{getOrderLabel(order)}</p>
          <p className="text-xs text-white/50">{order.type}</p>
          {order.requiresStaffConfirmation && (<span className="mt-1 inline-block rounded bg-secondary px-2 py-0.5 text-xs font-bold text-black">Site — aguarda confirmação</span>)}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</span>
      </div>

      <div className="mt-2 text-sm text-white/70">
        {order.items.map((item) => (<p key={item.id}>{item.quantity}x {item.menuItemName}{item.selectedChoice ? ` (${item.selectedChoice})` : ''}</p>))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="font-semibold text-secondary">{formatMoneyFromString(order.total)}</span>
        {canCancel && (<button onClick={() => onCancelClick(order)} className="text-xs text-red-400">Cancelar</button>)}
      </div>
    </div>
  );
}
