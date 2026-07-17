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
import { getShiftRange } from '../../utils/shift';

const TABS = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'CARDAPIO', label: 'Cardápio' },
  { key: 'USUARIOS', label: 'Usuários' },
  { key: 'BAIRROS', label: 'Bairros' },
  { key: 'CONFIG', label: 'Configurações' },
  { key: 'LOGS', label: 'Logs' },
];

function yesterdayRange() {
  const today = getShiftRange();
  return {
    from: new Date(today.from.getTime() - 24 * 60 * 60 * 1000),
    to: new Date(today.to.getTime() - 24 * 60 * 60 * 1000),
  };
}

export default function PanelTI() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [period, setPeriod] = useState<'hoje' | 'ontem'>('hoje');
  const range = period === 'hoje' ? getShiftRange() : yesterdayRange();

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
          <KpiCards from={range.from} to={range.to} />
          <RevenueChart from={range.from} to={range.to} />
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
