import { Request, Response, NextFunction } from 'express';
import { ordersService } from './orders.service';
import { createOrderSchema } from './orders.schema';

export const ordersController = {
  async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const orders = await ordersService.getOrders(user, req.query);
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },

  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedData = createOrderSchema.parse(req.body);
      const user = (req as any).user;
      const newOrder = await ordersService.createOrder(parsedData, user.userId, user.username, false);
      res.status(201).json(newOrder);
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { newStatus, notes } = req.body;
      const user = (req as any).user;
      const updatedOrder = await ordersService.updateOrderStatus(Number(id), newStatus, notes, user);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  },

  async confirmOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const updatedOrder = await ordersService.confirmOrder(Number(id), user);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  },

  async acceptDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const updatedOrder = await ordersService.acceptDelivery(Number(id), user);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  },

  async reportProblem(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { problem } = req.body;
      const user = (req as any).user;
      const updatedOrder = await ordersService.reportProblem(Number(id), problem, user);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  }
};