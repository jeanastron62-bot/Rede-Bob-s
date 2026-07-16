export type Role = 'GARCOM' | 'CHAPISTA' | 'ENTREGADOR' | 'ADM' | 'TI';
export type Category = 'HOT_DOGS' | 'HAMBURGUERES' | 'MACARRAO_NA_CHAPA' | 'BEBIDAS' | 'ACRESCIMOS';
export type OrderType = 'MESA' | 'RETIRADA' | 'DELIVERY';
export type OrderStatus = 'AGUARDANDO' | 'PREPARANDO' | 'PRONTO' | 'EM_ROTA' | 'ENTREGUE' | 'CANCELADO';
export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CREDITO' | 'DEBITO';

export interface RequiredChoice {
  label: string;
  options: string[];
}

export interface MenuItem {
  id: number;
  name: string;
  category: Category;
  price: string;
  description: string | null;
  available: boolean;
  archived: boolean;
  ingredients: string[];
  requiredChoice: RequiredChoice | null;
}

export interface Neighborhood {
  id: number;
  name: string;
  deliveryFee: string;
  active: boolean;
}

export interface SystemConfig {
  trailerOpen: boolean;
  deliveryActive: boolean;
  deliveryExtendedUntil: string | null;
  maxTables: number;
  contactPhone: string;
  contactInstagram: string;
}

export interface OrderItemExtra {
  id: number;
  menuItemId: number;
  menuItemName: string;
  unitPrice: string;
  quantity: number;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItemName: string;
  unitPrice: string;
  quantity: number;
  observations: string | null;
  selectedChoice: string | null;
  extras: OrderItemExtra[];
}

export interface Order {
  id: number;
  type: OrderType;
  status: OrderStatus;
  tableNumber: number | null;
  subtotal: string;
  total: string;
  paymentMethod: PaymentMethod;
  cashPaidAmount: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  neighborhoodId: number | null;
  neighborhoodNameSnapshot: string | null;
  deliveryFeeSnapshot: string | null;
  createdById: number | null;
  createdByName: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  clientOnline: boolean;
  requiresStaffConfirmation: boolean;
  problems: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface User {
  id: number;
  username: string;
  role: Role;
  approved: boolean;
}
