import { Request, Response, NextFunction } from 'express';
import { ordersService } from '../orders/orders.service';
import { listItems } from '../menu/menu.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { getConfig } from '../config/config.service';
import { createOrderSchema } from '../orders/orders.schema';

// PROVISÓRIO -- WhatsApp do trailer sem envio (Meta, erro 130497), todo
// cliente vai pedir pelo site, e pedido de mesa feito pelo cliente online
// não faz sentido (não existe numeração de mesa pro cliente -- quem está NA
// mesa já está no trailer). Schema NOVO, não altera createOrderSchema: a
// rota da equipe (orders.controller.ts) continua usando o original sem essa
// restrição, porque lançar MESA pelo painel é o fluxo normal de lá. Reverter
// é só remover este .refine() e voltar a usar createOrderSchema direto na
// rota pública.
const createPublicOrderSchema = createOrderSchema.refine((data) => data.type !== 'MESA', {
  message: 'Pedido de mesa não está disponível pelo site. Escolha Retirada ou Delivery.',
  path: ['type'],
});

export const publicController = {
  async getMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const menu = await listItems(false); // apenas archived: false
      const filtered = menu.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        ingredients: item.ingredients,
        requiredChoice: item.requiredChoice,
        available: item.available
      }));
      res.json(filtered);
    } catch (error) {
      next(error);
    }
  },

  async getNeighborhoods(req: Request, res: Response, next: NextFunction) {
    try {
      const neighborhoods = await listNeighborhoods();
      const active = neighborhoods.filter((n: any) => n.active).map((n: any) => ({
        id: n.id,
        name: n.name,
        deliveryFee: n.deliveryFee
      }));
      res.json(active);
    } catch (error) {
      next(error);
    }
  },

  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await getConfig();
      res.json({
        trailerOpen: config.trailerOpen,
        scheduledCloseAt: config.scheduledCloseAt,
        deliveryActive: config.deliveryActive,
        deliveryExtendedUntil: config.deliveryExtendedUntil,
        maxTables: config.maxTables,
        contactPhone: config.contactPhone,
        contactInstagram: config.contactInstagram
      });
    } catch (error) {
      next(error);
    }
  },

  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedData = createPublicOrderSchema.parse(req.body);
      // clientOnline = true acionará a trava requiresStaffConfirmation para MESA
      const newOrder = await ordersService.createOrder(parsedData, undefined, undefined, true);
      res.status(201).json(newOrder);
    } catch (error) {
      next(error);
    }
  }
};
