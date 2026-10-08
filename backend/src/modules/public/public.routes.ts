import { Router } from 'express';
import { publicController } from './public.controller';
import { publicGetLimiter, publicOrdersLimiter } from '../../middleware/rateLimit';

const router = Router();

// TEMPORÁRIO -- diagnóstico de IP por trás do proxy (Railway), pra confirmar
// quantos saltos o X-Forwarded-For carrega antes de decidir se trust
// proxy=1 (server.ts) está correto pra essa topologia. Só loga, não lê o
// resultado nem muda nada em req.ip/rate limit. Remover depois de confirmar.
router.use((req, _res, next) => {
  console.log('[IP_DIAG]', {
    ip: req.ip,
    xForwardedFor: req.headers['x-forwarded-for'],
    xRealIp: req.headers['x-real-ip'],
  });
  next();
});

router.get('/menu', publicGetLimiter, publicController.getMenu);
router.get('/neighborhoods', publicGetLimiter, publicController.getNeighborhoods);
router.get('/config', publicGetLimiter, publicController.getConfig);

router.post('/orders', publicOrdersLimiter, publicController.createOrder);

export default router;
