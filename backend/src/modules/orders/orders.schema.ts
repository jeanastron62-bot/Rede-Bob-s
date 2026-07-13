import { z } from 'zod';
import { PaymentMethod, OrderType } from '@prisma/client';

const orderItemExtraSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
});

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  observations: z.string().optional().nullable(),
  selectedChoice: z.string().optional().nullable(),
  extras: z.array(orderItemExtraSchema).default([]),
});

export const createOrderSchema = z.object({
  type: z.nativeEnum(OrderType),
  tableNumber: z.number().int().optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  cashPaidAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  neighborhoodId: z.number().int().optional().nullable(),
  items: z.array(orderItemSchema).min(1, "O pedido precisa ter pelo menos um item"),
}).refine(data => {
  if (data.type === 'RETIRADA' || data.type === 'DELIVERY') {
    return !!data.customerName && !!data.customerPhone;
  }
  return true;
}, {
  message: "Nome e telefone são obrigatórios para pedidos de Retirada ou Delivery",
  path: ["customerPhone"]
});
