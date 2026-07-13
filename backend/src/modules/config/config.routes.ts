import { Router } from 'express';
import * as configController from './config.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', configController.get);
router.patch('/', requireRole(Role.ADM, Role.TI), configController.update);

export default router;
