import { useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { Tabs } from '../../components/ui/Tabs';
import { KpiCards } from '../../components/admin/KpiCards';
import { RevenueChart } from '../../components/admin/RevenueChart';
import { PeriodSelector } from '../../components/admin/PeriodSelector';
import { MenuManagement } from '../../components/admin/MenuManagement';
import { UsersManagement } from '../../components/admin/UsersManagement';
import { NeighborhoodsManagement } from '../../components/admin/NeighborhoodsManagement';
import { SettingsPanel } from '../../components/admin/SettingsPanel';
import { ExportPdfButton } from '../../components/admin/ExportPdfButton';
import { usePeriodSelection } from '../../hooks/usePeriodSelection';

const TABS = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'CARDAPIO', label: 'Cardápio' },
  { key: 'USUARIOS', label: 'Usuários' },
  { key: 'BAIRROS', label: 'Bairros' },
  { key: 'CONFIG', label: 'Configurações' },
];

export default function PanelADM() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const {
    period, setPeriod,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    applyCustomRange,
    range, periodLabel, rangeError,
  } = usePeriodSelection();

  return (
    <PanelLayout title="Painel Admin">
      <div className="mb-4">
        <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'DASHBOARD' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <PeriodSelector
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              onApplyCustom={applyCustomRange}
            />
            {range && <ExportPdfButton range={range} periodLabel={periodLabel} />}
          </div>
          {rangeError && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{rangeError}</p>}
          {range && (
            <>
              <KpiCards from={range.from} to={range.to} />
              <RevenueChart from={range.from} to={range.to} period={period} />
            </>
          )}
          {!range && !rangeError && <p className="text-neutral-500">Carregando período...</p>}
        </div>
      )}
      {activeTab === 'CARDAPIO' && <MenuManagement />}
      {activeTab === 'USUARIOS' && <UsersManagement />}
      {activeTab === 'BAIRROS' && <NeighborhoodsManagement />}
      {activeTab === 'CONFIG' && <SettingsPanel />}
    </PanelLayout>
  );
}
