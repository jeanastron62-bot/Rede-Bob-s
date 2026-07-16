import { Tabs } from '../ui/Tabs';
import type { Category } from '../../types';

const VISIBLE_CATEGORIES: { key: Category; label: string }[] = [
  { key: 'HOT_DOGS', label: 'Hot-Dogs' },
  { key: 'HAMBURGUERES', label: 'Hambúrgueres' },
  { key: 'MACARRAO_NA_CHAPA', label: 'Macarrão na Chapa' },
  { key: 'BEBIDAS', label: 'Bebidas' },
];
// ACRESCIMOS deliberadamente ausente -- nunca e aba navegavel (CONTEXTO.md secao 10)

interface CategoryTabsProps {
  active: Category;
  onChange: (category: Category) => void;
}

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <Tabs
      items={VISIBLE_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
      active={active}
      onChange={(key) => onChange(key as Category)}
    />
  );
}
