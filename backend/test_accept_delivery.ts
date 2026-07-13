import { ordersService } from './src/modules/orders/orders.service';
import { OrderStatus } from '@prisma/client';

async function run() {
  try {
    console.log('1. Criando pedido de DELIVERY...');
    const order = await ordersService.createOrder({
      type: 'DELIVERY',
      paymentMethod: 'PIX',
      customerName: 'Cliente Teste',
      customerPhone: '11999999999',
      customerAddress: 'Rua Teste, 123',
      neighborhoodId: 1, // Assumindo que existe ID 1
      items: [
        {
          menuItemId: 1, // Assumindo que existe ID 1
          quantity: 1,
          extras: []
        }
      ]
    });
    console.log(`Pedido criado ID: ${order.id}`);

    console.log('\n2. Avançando para PREPARANDO e depois PRONTO...');
    const admUser = { id: 1, username: 'admin', role: 'ADM' };
    await ordersService.updateOrderStatus(order.id, 'PREPARANDO', undefined, admUser);
    await ordersService.updateOrderStatus(order.id, 'PRONTO', undefined, admUser);
    console.log('Pedido agora está PRONTO.');

    console.log('\n3. Aceitando corrida como ENTREGADOR...');
    const driverUser = { id: 2, username: 'motoboy_z', role: 'ENTREGADOR' };
    const acceptedOrder = await ordersService.acceptDelivery(order.id, driverUser);
    
    console.log('\n=== JSON DE RESPOSTA ===');
    console.log(JSON.stringify(acceptedOrder, null, 2));

  } catch (err: any) {
    console.error('ERRO:', err.message || err);
  }
}

run();
