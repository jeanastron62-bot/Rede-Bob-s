import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('10h'),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('America/Sao_Paulo'),
  META_APP_SECRET: z.string().min(10),
  META_VERIFY_TOKEN: z.string().min(6),
  OPENAI_API_KEY: z.string().min(10),
  OPENAI_MODEL: z.string().default('gpt-5.1-mini'),
  META_ACCESS_TOKEN: z.string().min(10),
  META_PHONE_NUMBER_ID: z.string().min(5),
  // Fase 15 -- Embedded Signup (Tech Provider). META_APP_ID é novo: troca de
  // código OAuth por token de negócio usa App ID + o App Secret que já existe.
  META_APP_ID: z.string().min(5),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().min(40)
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Configuração de ambiente inválida:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;

process.env.TZ = env.TZ;
