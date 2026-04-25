import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string(),
  DATABASE_URL: z.string(),
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
});

export const config = configSchema.parse(process.env);
