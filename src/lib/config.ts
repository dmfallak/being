import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string(),
  DATABASE_URL: z.string(),
});

export const config = configSchema.parse(process.env);
