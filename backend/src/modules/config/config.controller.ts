import { Request, Response, NextFunction } from 'express';
import * as configService from './config.service';
import { updateConfigSchema, rescheduleCloseSchema, dailyNoticeSchema } from './config.schema';
import { getIO } from '../../socket/socket';
import { getShiftRange } from '../../utils/shift';

function broadcastConfig(conf: Awaited<ReturnType<typeof configService.getConfig>>) {
  const io = getIO();
  io.of('/staff').emit('system:config_changed', conf);
  io.of('/public').emit('system:public_config', {
    trailerOpen: conf.trailerOpen,
    scheduledCloseAt: conf.scheduledCloseAt,
    deliveryActive: conf.deliveryActive,
    deliveryExtendedUntil: conf.deliveryExtendedUntil,
    maxTables: conf.maxTables
  });
}

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.getConfig();
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const shiftRange = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const range = getShiftRange();
    res.json({ from: range.from.toISOString(), to: range.to.toISOString() });
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateConfigSchema.parse(req.body);
    const conf = await configService.updateConfig(data, req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const extendDelivery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.extendDelivery(req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

// Fase 11 -- ações dedicadas de abrir/fechar/adiar, acessíveis a
// GARCOM/CHAPISTA/ADM/TI (ver requireRole em config.routes.ts).
export const openTrailer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.openTrailer(req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const closeTrailer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.closeTrailer(req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const rescheduleClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { closeAt } = rescheduleCloseSchema.parse(req.body);
    const conf = await configService.rescheduleClose(closeAt, req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const updateDailyNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dailyNotice } = dailyNoticeSchema.parse(req.body);
    const conf = await configService.updateDailyNotice(dailyNotice, req.user!);
    broadcastConfig(conf);
    res.json(conf);
  } catch (error) {
    next(error);
  }
};
