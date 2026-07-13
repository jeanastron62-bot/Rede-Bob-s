import { Router } from 'express';
import { publicController } from './public.controller';
import { rateLimit } from 'express-rate-limit';

const router = Router();

const lightRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});

const strictRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Muitos pedidos criados em pouco tempo. Tente novamente mais tarde.' }
});

router.get('/menu', lightRateLimit, publicController.getMenu);
router.get('/neighborhoods', lightRateLimit, publicController.getNeighborhoods);
router.get('/config', lightRateLimit, publicController.getConfig);

router.post('/orders', strictRateLimit, publicController.createOrder);

export default router;
