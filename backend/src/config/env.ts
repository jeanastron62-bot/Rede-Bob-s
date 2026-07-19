import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('10h'),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('America/Sao_Paulo')
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Configuração de ambiente inválida:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;

process.env.TZ = env.TZ;
