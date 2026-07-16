import { useEffect, useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { KitchenOrderCard } from '../../components/order/KitchenOrderCard';
import { CancelWithTimerModal } from '../../components/order/CancelWithTimerModal';
import { OrderWizard } from '../../components/order/OrderWizard';
import { AvailabilityToggleModal } from '../../components/menu/AvailabilityToggleModal';
import { getOrderLabel } from '../../utils/orderLabel';
import { useOrdersStore } from '../../stores/useOrdersStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useSocketStore } from '../../stores/useSocketStore';
import { api } from '../../services/api';
import type { Order, OrderStatus } from '../../types';

export default function PanelChapista() {
  const orders = useOrdersStore((s) => s.orders);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const ordersError = useOrdersStore((s) => s.error);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const connectStaff = useSocketStore((s) => s.connectStaff);

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  useEffect(() => { fetchOrders(); fetchCatalog(); connectStaff(); }, [fetchOrders, fetchCatalog, connectStaff]);

  const preparing = orders.filter((o) => (o.status === 'AGUARDANDO' || o.status === 'PREPARANDO') && !o.requiresStaffConfirmation);
  const ready = orders.filter((o) => o.status === 'PRONTO' && !o.requiresStaffConfirmation);

  const handleAdvance = async (order: Order) => {
    const newStatus: OrderStatus = order.status === 'AGUARDANDO' ? 'PREPARANDO' : 'PRONTO';
    try { await api.patch(`/orders/${order.id}/status`, { newStatus }); } catch (err: any) { alert(err.response?.data?.error || 'Erro ao avançar pedido.'); }
  };

  const handleConfirmCancel = async (notes: string) => {
    if (!cancelTarget) return;
    try { await api.patch(`/orders/${cancelTarget.id}/status`, { newStatus: 'CANCELADO', notes }); } catch (err: any) { alert(err.response?.data?.error || 'Erro ao cancelar.'); }
  };

  return (
    <PanelLayout title="Painel da Cozinha">
      {ordersError && (<div className="mb-4 rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{ordersError}</div>)}

      <div className="mb-4 flex gap-2">
        <button onClick={() => setWizardOpen(true)} className="h-11 rounded-xl bg-neutral-850 border border-neutral-750 px-4 text-sm font-bold text-neutral-300 hover:text-white">+ Lançamento Manual</button>
        <button onClick={() => setAvailabilityOpen(true)} className="h-11 rounded-xl bg-neutral-850 border border-neutral-750 px-4 text-sm font-bold text-neutral-300 hover:text-white">Disponibilidade</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="mb-3 font-mono text-xs font-black uppercase tracking-widest text-neutral-500">Em Preparação ({preparing.length})</h2>
          <div className="flex flex-col gap-3">
            {preparing.map((order) => (<KitchenOrderCard key={order.id} order={order} actionLabel={order.status === 'AGUARDANDO' ? 'Começar Preparo →' : 'Pronto na Estufa ✓'} onAction={() => handleAdvance(order)} onCancelClick={() => setCancelTarget(order)} />))}
            {preparing.length === 0 && <p className="text-sm text-neutral-600">Nenhum pedido em preparo.</p>}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-mono text-xs font-black uppercase tracking-widest text-neutral-500">Pronto na Estufa ({ready.length})</h2>
          <div className="flex flex-col gap-3">
            {ready.map((order) => (
              <div key={order.id} className="rounded-2xl bg-neutral-900/50 border border-neutral-850 p-5">
                <p className="font-black text-white font-display text-lg">{getOrderLabel(order)}</p>
                <p className="text-xs font-mono uppercase text-emerald-400 mt-1">Aguardando retirada</p>
                <button onClick={() => setCancelTarget(order)} className="mt-3 h-10 w-full rounded-xl bg-neutral-850 border border-neutral-750 text-neutral-400 text-xs font-mono uppercase">Cancelar</button>
              </div>
            ))}
            {ready.length === 0 && <p className="text-sm text-neutral-600">Nada pronto no momento.</p>}
          </div>
        </div>
      </div>

      <OrderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <AvailabilityToggleModal open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
      <CancelWithTimerModal open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleConfirmCancel} />
    </PanelLayout>
  );
}
