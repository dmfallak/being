// src/lib/entity.ts
import { generateResponse } from './llm.js';
import { embed } from './embed.js';
import { upsertEntityFact } from './db.js';
import type { Message } from './llm.js';

export type ExtractedFact = {
  content: string;
  category: 'user' | 'world' | 'being';
};

const EXTRACTION_PROMPT = `You are analysing a conversation to extract factual hypotheses.

Output a JSON array of objects. Each object has:
- "content": a concise hedged hypothesis ("seems", "appears", "mentioned"). Only include observations likely to matter in future conversations.
- "category": one of "user" (about this person), "world" (about external events or reality), or "being" (about you, the AI).

If there is nothing notable, output an empty array [].
Output ONLY the JSON array. No prose, no markdown fences.`;

export async function extractFacts(
  userId: string,
  messages: Message[],
): Promise<ExtractedFact[]> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Being'}: ${m.content}`)
    .join('\n');

  const response = await generateResponse(EXTRACTION_PROMPT, [
    { role: 'user', content: `Conversation:\n${transcript}` },
  ]);

  let facts: ExtractedFact[];
  try {
    const parsed = JSON.parse(response.trim());
    if (!Array.isArray(parsed)) return [];
    facts = parsed.filter(
      (f): f is ExtractedFact =>
        typeof f?.content === 'string' &&
        ['user', 'world', 'being'].includes(f?.category),
    );
  } catch {
    return [];
  }

  await Promise.all(
    facts.map(async fact => {
      const embedding = await embed(fact.content).catch(() => undefined);
      await upsertEntityFact(userId, fact.content, 0.7, fact.category, embedding);
    }),
  );

  return facts;
}
