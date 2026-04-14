// src/lib/embed.ts
import { google } from '@ai-sdk/google';
import { embed as aiEmbed } from 'ai';

export async function embed(text: string): Promise<number[]> {
  const { embedding } = await aiEmbed({
    model: google.textEmbeddingModel('text-embedding-004'),
    value: text,
  });
  return embedding;
}
