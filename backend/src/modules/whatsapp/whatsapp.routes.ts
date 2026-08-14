import { Router } from 'express';
import { Role } from '@prisma/client';
import * as whatsappController from './whatsapp.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.get('/', whatsappController.verify);
router.post('/', whatsappController.receive);

// Fase 14.7 -- endpoint mínimo pra destravar uma conversa pausada por
// transferir_para_humano.
router.patch(
  '/conversations/:id/resume',
  requireAuth,
  requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI),
  whatsappController.resumeConversation
);

// Caixa de entrada -- conversas paradas esperando atendente humano depois de
// transferir_para_humano. Mesmas roles do /resume: quem pode destravar
// precisa poder ver a lista.
router.get(
  '/conversations/paused',
  requireAuth,
  requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI),
  whatsappController.listPausedConversations
);

// Fase 15.2/15.3 -- conexão da WABA do cliente via Embedded Signup. ADM/TI,
// mesmo padrão de permissão de config/usuários (não é operação do dia a dia
// do garçom/chapista).
router.post(
  '/connect',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.connectBusinessAccount
);
router.get(
  '/business-account',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.getBusinessAccount
);
router.patch(
  '/business-account/:id/disconnect',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.disconnectBusinessAccount
);

export default router;
