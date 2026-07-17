import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { SystemConfig } from '../../types';

export function SettingsPanel() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [deliveryActive, setDeliveryActive] = useState(false);
  const [maxTables, setMaxTables] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactInstagram, setContactInstagram] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<SystemConfig>('/config');
      setConfig(data);
      setTrailerOpen(data.trailerOpen);
      setDeliveryActive(data.deliveryActive);
      setMaxTables(String(data.maxTables));
      setContactPhone(data.contactPhone);
      setContactInstagram(data.contactInstagram);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch<SystemConfig>('/config', {
        trailerOpen,
        deliveryActive,
        maxTables: parseInt(maxTables, 10),
        contactPhone,
        contactInstagram,
      });
      setConfig(data);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async () => {
    setExtending(true);
    setError(null);
    try {
      const { data } = await api.patch<SystemConfig>('/config/extend-delivery');
      setConfig(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao prorrogar delivery.');
    } finally {
      setExtending(false);
    }
  };

  if (loading) return <p className="text-white/60">Carregando...</p>;

  const extendedUntil = config?.deliveryExtendedUntil ? new Date(config.deliveryExtendedUntil) : null;
  const extensionActive = extendedUntil !== null && extendedUntil > new Date();

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-950/40 border border-emerald-900/60 p-3 text-sm text-emerald-300">Configurações salvas.</p>}

      <label className="flex items-center justify-between rounded-lg bg-bg-elevated p-3">
        <span className="text-white">Trailer aberto</span>
        <input type="checkbox" checked={trailerOpen} onChange={(e) => setTrailerOpen(e.target.checked)} className="h-5 w-5" />
      </label>

      <label className="flex items-center justify-between rounded-lg bg-bg-elevated p-3">
        <span className="text-white">Delivery ativo</span>
        <input type="checkbox" checked={deliveryActive} onChange={(e) => setDeliveryActive(e.target.checked)} className="h-5 w-5" />
      </label>

      <div className="rounded-lg bg-bg-elevated p-3">
        <p className="text-sm text-white/70">
          Corte automático de delivery às 00h.{' '}
          {extensionActive
            ? `Prorrogado até ${extendedUntil!.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
            : 'Sem prorrogação ativa.'}
        </p>
        <Button variant="secondary" size="md" className="mt-2 w-full" onClick={handleExtend} disabled={extending}>
          {extending ? 'Prorrogando...' : '+1h de delivery'}
        </Button>
      </div>

      <Input label="Número de mesas" type="number" min={1} value={maxTables} onChange={(e) => setMaxTables(e.target.value)} />
      <Input label="Telefone de contato" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      <Input label="Instagram" value={contactInstagram} onChange={(e) => setContactInstagram(e.target.value)} />

      <Button size="lg" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
    </div>
  );
}
