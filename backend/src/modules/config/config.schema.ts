import { z } from 'zod';

export const updateConfigSchema = z.object({
  trailerOpen: z.boolean().optional(),
  deliveryActive: z.boolean().optional(),
  maxTables: z.number().int().positive().optional(),
  contactPhone: z.string().optional(),
  contactInstagram: z.string().optional(),
}).strict();
