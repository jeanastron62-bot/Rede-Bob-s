import clsx from 'clsx';

export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={clsx(
            'h-12 shrink-0 rounded-lg px-4 text-base font-medium transition-colors',
            active === item.key
              ? 'bg-primary text-white'
              : 'bg-bg-elevated text-white/70 hover:bg-white/10',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
