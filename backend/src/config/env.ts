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

// Garante que Date use o fuso correto mesmo se a variável TZ não vier definida
// no ambiente de execução real (o default do Zod só existe neste objeto, nunca
// escreve de volta em process.env sozinho).
process.env.TZ = env.TZ;
