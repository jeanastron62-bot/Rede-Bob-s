import { Request, Response, NextFunction } from 'express';
import * as configService from './config.service';
import { getIO } from '../../socket/socket';

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.getConfig();
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.updateConfig(req.body, req.user!);

    const io = getIO();
    io.of('/staff').emit('system:config_changed', conf);
    io.of('/public').emit('system:public_config', {
      trailerOpen: conf.trailerOpen,
      deliveryActive: conf.deliveryActive,
      deliveryExtendedUntil: conf.deliveryExtendedUntil,
      maxTables: conf.maxTables
    });

    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const extendDelivery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.extendDelivery(req.user!);

    const io = getIO();
    io.of('/staff').emit('system:config_changed', conf);
    io.of('/public').emit('system:public_config', {
      trailerOpen: conf.trailerOpen,
      deliveryActive: conf.deliveryActive,
      deliveryExtendedUntil: conf.deliveryExtendedUntil,
      maxTables: conf.maxTables
    });

    res.json(conf);
  } catch (error) {
    next(error);
  }
};
