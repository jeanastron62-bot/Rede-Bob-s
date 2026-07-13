import { Request, Response, NextFunction } from 'express';
import * as neighborhoodsService from './neighborhoods.service';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await neighborhoodsService.listNeighborhoods();
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await neighborhoodsService.createNeighborhood(req.body, req.user!);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const item = await neighborhoodsService.updateNeighborhood(id, req.body, req.user!);
    res.json(item);
  } catch (error) {
    next(error);
  }
};
