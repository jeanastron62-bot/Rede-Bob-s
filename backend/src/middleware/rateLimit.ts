import { Request } from 'express';
import rateLimit from 'express-rate-limit';

// PROVISÓRIO -- medição em produção (Railway) confirmou: X-Forwarded-For
// chega com 2 entradas, "IP do cliente, IP da borda". Com trust proxy=1
// (server.ts), req.ip pega a ENTRADA DA BORDA (ex.: 46.151.194.x) -- igual
// pra todo cliente, agrupando todo mundo no mesmo balde. x-real-ip, nessa
// mesma medição, trouxe o IP real do cliente. Usa esse header quando
// existir; cai pra req.ip só em ambiente local (sem proxy na frente, o
// header nunca chega). Não toca trust proxy nem os limites -- só decide
// QUAL string identifica o cliente.
export function keyGenerator(req: Request): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return req.ip ?? 'sem-ip';
}

export const publicGetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

export const publicOrdersLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Muitas requisições de login/cadastro. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});
