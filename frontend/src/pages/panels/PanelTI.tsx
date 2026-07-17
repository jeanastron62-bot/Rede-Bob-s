import { useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { KpiCards } from '../../components/admin/KpiCards';
import { RevenueChart } from '../../components/admin/RevenueChart';
import { MenuManagement } from '../../components/admin/MenuManagement';
import { UsersManagement } from '../../components/admin/UsersManagement';
import { NeighborhoodsManagement } from '../../components/admin/NeighborhoodsManagement';
import { SettingsPanel } from '../../components/admin/SettingsPanel';
import { LogsViewer } from '../../components/ti/LogsViewer';
import { LogsExport } from '../../components/ti/LogsExport';
import { useShiftRange } from '../../hooks/useShiftRange';

const TABS = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'CARDAPIO', label: 'Cardápio' },
  { key: 'USUARIOS', label: 'Usuários' },
  { key: 'BAIRROS', label: 'Bairros' },
  { key: 'CONFIG', label: 'Configurações' },
  { key: 'LOGS', label: 'Logs' },
];

export default function PanelTI() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [period, setPeriod] = useState<'hoje' | 'ontem'>('hoje');
  const { range: todayRange, error: rangeError } = useShiftRange();
  const range = todayRange
    ? period === 'hoje'
      ? todayRange
      : { from: new Date(todayRange.from.getTime() - 24 * 60 * 60 * 1000), to: new Date(todayRange.to.getTime() - 24 * 60 * 60 * 1000) }
    : null;

  return (
    <PanelLayout title="Painel TI">
      <div className="mb-4">
        <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'DASHBOARD' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button variant={period === 'hoje' ? 'primary' : 'ghost'} size="md" onClick={() => setPeriod('hoje')}>Hoje</Button>
            <Button variant={period === 'ontem' ? 'primary' : 'ghost'} size="md" onClick={() => setPeriod('ontem')}>Ontem</Button>
          </div>
          {rangeError && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{rangeError}</p>}
          {range && (
            <>
              <KpiCards from={range.from} to={range.to} />
              <RevenueChart from={range.from} to={range.to} />
            </>
          )}
          {!range && !rangeError && <p className="text-white/60">Carregando período...</p>}
        </div>
      )}
      {activeTab === 'CARDAPIO' && <MenuManagement />}
      {activeTab === 'USUARIOS' && <UsersManagement />}
      {activeTab === 'BAIRROS' && <NeighborhoodsManagement />}
      {activeTab === 'CONFIG' && <SettingsPanel />}
      {activeTab === 'LOGS' && (
        <div className="flex flex-col gap-4">
          <LogsExport />
          <LogsViewer />
        </div>
      )}
    </PanelLayout>
  );
}
