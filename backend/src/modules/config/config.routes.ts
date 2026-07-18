import { Router } from 'express';
import * as configController from './config.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', configController.get);
router.get('/shift-range', configController.shiftRange);
router.patch('/', requireRole(Role.ADM, Role.TI), configController.update);
router.patch('/extend-delivery', requireRole(Role.ADM, Role.TI), configController.extendDelivery);

export default router;
