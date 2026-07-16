import type { Order } from '../types';

export function getOrderLabel(order: Pick<Order, 'id' | 'type' | 'tableNumber' | 'customerName'>): string {
  if (order.type === 'MESA') {
    return `Mesa ${order.tableNumber ?? '?'}`;
  }
  const name = order.customerName || 'Sem Nome';
  if (order.type === 'DELIVERY') return `Delivery: ${name}`;
  if (order.type === 'RETIRADA') return `Retirada: ${name}`;
  return `Pedido #${order.id}`;
}
