// src/lib/embed.ts
import { google } from '@ai-sdk/google';
import { embed as aiEmbed } from 'ai';

export async function embed(text: string): Promise<number[]> {
  const { embedding } = await aiEmbed({
    model: google.textEmbeddingModel('gemini-embedding-001'),
    value: text,
    providerOptions: { google: { outputDimensionality: 768 } },
  });
  return embedding;
}
