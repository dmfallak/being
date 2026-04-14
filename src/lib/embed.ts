// src/lib/embed.ts
import { google } from '@ai-sdk/google';
import { embed as aiEmbed } from 'ai';

const embeddingModel = google.textEmbeddingModel('text-embedding-004');

export async function embed(text: string): Promise<number[]> {
  const { embedding } = await aiEmbed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}
