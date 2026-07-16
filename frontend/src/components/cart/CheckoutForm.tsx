import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useCartStore } from '../../stores/useCartStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { publicApi } from '../../services/publicApi';
import { formatMoney } from '../../utils/money';
import { maskPhone } from '../../utils/phoneMask';
import { getWhatsappLink } from '../../utils/whatsapp';
import type { OrderType, PaymentMethod } from '../../types';

interface CheckoutFormProps {
  onClose: () => void;
}

const OUTRO_BAIRRO = '__outro__';

export function CheckoutForm({ onClose }: CheckoutFormProps) {
  const items = useCartStore((s) => s.items);
  const subtotalCents = useCartStore((s) => s.getSubtotalCents());
  const clearCart = useCartStore((s) => s.clearCart);
  const config = useCatalogStore((s) => s.config);
  const neighborhoods = useCatalogStore((s) => s.neighborhoods);

  const [type, setType] = useState<OrderType>('MESA');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [cashPaidAmount, setCashPaidAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  const activeNeighborhoods = neighborhoods.filter((n) => n.active !== false);
  const selectedNeighborhood = activeNeighborhoods.find((n) => String(n.id) === neighborhoodId);
  const deliveryFeeCents = selectedNeighborhood ? Math.round(parseFloat(selectedNeighborhood.deliveryFee) * 100) : 0;
  const totalCents = subtotalCents + (type === 'DELIVERY' ? deliveryFeeCents : 0);
  const isOutro = neighborhoodId === OUTRO_BAIRRO;
  const whatsappUrl = config ? getWhatsappLink(config.contactPhone) : '';

  const canSubmit = (() => {
    if (loading) return false;
    if (type === 'MESA') {
      const n = parseInt(tableNumber, 10);
      if (!n || n < 1 || (config && n > config.maxTables)) return false;
    }
    if (type === 'RETIRADA' || type === 'DELIVERY') {
      if (!customerName.trim() || !customerPhone.trim()) return false;
    }
    if (type === 'DELIVERY') {
      if (!customerAddress.trim()) return false;
      if (!neighborhoodId || isOutro) return false;
    }
    if (paymentMethod === 'DINHEIRO') {
      const cash = Math.round(parseFloat(cashPaidAmount || '0') * 100);
      if (cash < totalCents) return false;
    }
    return true;
  })();

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: any = {
        type,
        paymentMethod,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          observations: i.observations,
          selectedChoice: i.selectedChoice,
          extras: i.extras.map((e) => ({ menuItemId: e.menuItemId, quantity: e.quantity })),
        })),
      };
      if (type === 'MESA') payload.tableNumber = parseInt(tableNumber, 10);
      if (type === 'RETIRADA' || type === 'DELIVERY') {
        payload.customerName = customerName.trim();
        payload.customerPhone = customerPhone.trim();
      }
      if (type === 'DELIVERY') {
        payload.customerAddress = customerAddress.trim();
        payload.neighborhoodId = parseInt(neighborhoodId, 10);
      }
      if (paymentMethod === 'DINHEIRO') {
        payload.cashPaidAmount = parseFloat(cashPaidAmount).toFixed(2);
      }

      const { data } = await publicApi.post('/orders', payload);
      setOrderId(data.id);
      clearCart();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar pedido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (orderId !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-2xl font-bold text-white">Pedido #{orderId} recebido!</p>
        <p className="text-white/70">Guarde esse número para se identificar.</p>
        <Button onClick={onClose} className="mt-4">Fechar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['MESA', 'RETIRADA', 'DELIVERY'] as OrderType[]).map((t) => (<button key={t} onClick={() => setType(t)} className={`h-11 flex-1 rounded-lg text-sm font-medium ${type === t ? 'bg-primary text-white' : 'bg-bg-elevated text-white/70'}`}>{t === 'MESA' ? 'Mesa' : t === 'RETIRADA' ? 'Retirada' : 'Delivery'}</button>))}
      </div>

      {type === 'MESA' && (<Input label={`Número da mesa (1 a ${config?.maxTables ?? '?'})`} type="number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} />)}

      {(type === 'RETIRADA' || type === 'DELIVERY') && (<><Input label="Nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /><Input label="Telefone" value={customerPhone} onChange={(e) => setCustomerPhone(maskPhone(e.target.value))} /></>)}

      {type === 'DELIVERY' && (
        <>
          <Input label="Endereço" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          <Select label="Bairro" value={neighborhoodId} onChange={(e) => setNeighborhoodId(e.target.value)}>
            <option value="">Selecione...</option>
            {activeNeighborhoods.map((n) => (<option key={n.id} value={n.id}>{n.name} — {formatMoney(Math.round(parseFloat(n.deliveryFee) * 100))}</option>))}
            <option value={OUTRO_BAIRRO}>Outro bairro (ligar para confirmar)</option>
          </Select>
          {isOutro && config && (<div className="rounded-lg bg-bg-elevated p-3 text-sm text-white/80">Seu bairro não está na lista. Fale com a gente pelo WhatsApp: <a href={whatsappUrl} className="text-secondary" target="_blank" rel="noreferrer">{config.contactPhone}</a></div>)}
        </>
      )}

      <Select label="Pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
        <option value="PIX">Pix</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option><option value="DINHEIRO">Dinheiro</option>
      </Select>

      {paymentMethod === 'DINHEIRO' && (<Input label="Vai pagar com quanto?" type="number" step="0.01" value={cashPaidAmount} onChange={(e) => setCashPaidAmount(e.target.value)} />)}

      <div className="flex items-center justify-between border-t border-white/10 pt-3 text-lg font-semibold text-white"><span>Total</span><span>{formatMoney(totalCents)}</span></div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button size="lg" disabled={!canSubmit} onClick={handleSubmit}>{loading ? 'Enviando...' : 'Finalizar Pedido'}</Button>
    </div>
  );
}
