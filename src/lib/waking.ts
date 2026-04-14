// src/lib/waking.ts
import { embed } from './embed.js';
import { getEntityFactEmbeddings } from './db.js';
import { softGateScore } from './salience.js';

export async function buildContextBudget(
  userId: string,
  conversationOpener: string,
  salienceThreshold = 0.5,
  maxItems = 20,
): Promise<string[]> {
  const queryEmbedding = await embed(conversationOpener);
  const candidates = await getEntityFactEmbeddings(userId, queryEmbedding);

  const scored = candidates.map(c => ({
    content: c.content,
    score: softGateScore(c.similarity, c.salience, salienceThreshold),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(c => c.content);
}
