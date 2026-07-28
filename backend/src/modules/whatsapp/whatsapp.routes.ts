import { Router } from 'express';
import { Role } from '@prisma/client';
import * as whatsappController from './whatsapp.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.get('/', whatsappController.verify);
router.post('/', whatsappController.receive);

// Fase 14.7 -- endpoint mínimo pra destravar uma conversa pausada por
// transferir_para_humano. UI de caixa de entrada é fase futura; sem isso um
// teste de handoff deixa a conversa presa pra sempre.
router.patch(
  '/conversations/:id/resume',
  requireAuth,
  requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI),
  whatsappController.resumeConversation
);

export default router;
