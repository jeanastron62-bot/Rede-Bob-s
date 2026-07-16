import { useEffect, useState } from 'react';
import { useCatalogStore } from '../stores/useCatalogStore';
import { useCartStore } from '../stores/useCartStore';
import { useSocketStore } from '../stores/useSocketStore';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { CategoryTabs } from '../components/menu/CategoryTabs';
import { MenuItemCard } from '../components/menu/MenuItemCard';
import { ItemCustomizationModal, type CustomizedItemResult } from '../components/menu/ItemCustomizationModal';
import { CartDrawer } from '../components/cart/CartDrawer';
import { Modal } from '../components/ui/Modal';
import { CheckoutForm } from '../components/cart/CheckoutForm';
import type { Category, MenuItem } from '../types';

const NEEDS_MODAL_CATEGORIES: Category[] = ['HOT_DOGS', 'HAMBURGUERES', 'MACARRAO_NA_CHAPA'];

export default function PublicMenu() {
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const menuItems = useCatalogStore((s) => s.menuItems);
  const config = useCatalogStore((s) => s.config);
  const isLoading = useCatalogStore((s) => s.isLoading);
  const catalogError = useCatalogStore((s) => s.error);
  const connectPublic = useSocketStore((s) => s.connectPublic);
  const addItem = useCartStore((s) => s.addItem);

  const [activeCategory, setActiveCategory] = useState<Category>('HOT_DOGS');
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    fetchCatalog();
    connectPublic();
  }, [fetchCatalog, connectPublic]);

  const extrasOptions = menuItems.filter((i) => i.category === 'ACRESCIMOS' && i.available);
  const visibleItems = menuItems.filter((i) => i.category === activeCategory);
  const trailerOpen = config === null || config.trailerOpen !== false;

  const handleSelectItem = (item: MenuItem) => {
    const needsModal = item.requiredChoice !== null || NEEDS_MODAL_CATEGORIES.includes(item.category);
    if (needsModal) {
      setModalItem(item);
    } else {
      addItem({
        menuItemId: item.id,
        menuItemName: item.name,
        unitPriceCents: Math.round(parseFloat(item.price) * 100),
        quantity: 1,
        observations: null,
        selectedChoice: null,
        extras: [],
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader onCartClick={() => setCartOpen(true)} />

      <main className="flex-1 px-4 py-4">
        <CategoryTabs active={activeCategory} onChange={setActiveCategory} />

        {isLoading && <p className="mt-8 text-center text-white/60">Carregando cardápio...</p>}

        {catalogError && !isLoading && (
          <div className="mt-8 rounded-lg bg-red-900/40 p-4 text-center text-red-200">
            Não foi possível carregar o cardápio agora. Puxe a tela para atualizar ou tente novamente em instantes.
            <button onClick={() => fetchCatalog()} className="mt-2 block w-full text-sm underline">Tentar de novo</button>
          </div>
        )}

        {!isLoading && !catalogError && visibleItems.length === 0 && (
          <p className="mt-8 text-center text-white/60">Nenhum item disponível nesta categoria.</p>
        )}

        {!isLoading && !catalogError && visibleItems.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleItems.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={handleSelectItem} disabled={!trailerOpen} />
            ))}
          </div>
        )}
      </main>

      <PublicFooter />

      <ItemCustomizationModal
        item={modalItem}
        extrasOptions={extrasOptions}
        onClose={() => setModalItem(null)}
        onConfirm={(result: CustomizedItemResult) => addItem(result)}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Finalizar Pedido">
        <CheckoutForm onClose={() => setCheckoutOpen(false)} />
      </Modal>
    </div>
  );
}
