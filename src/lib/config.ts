import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  GOOGLE_API_KEY: z.string(),
  DATABASE_URL: z.string().optional(),
});

export const config = configSchema.parse(process.env);
