// src/lib/entity.ts
import { generateResponse } from './llm.js';
import { embed } from './embed.js';
import { upsertEntityFact } from './db.js';
import type { Message } from './llm.js';

const EXTRACTION_PROMPT = `You are analysing a conversation to extract factual hypotheses about the user.
Output a bullet list of concise hypotheses, one per line, starting with "- ".
These are provisional observations, not conclusions. Use hedged language ("seems", "appears", "mentioned").
Only include observations that are likely to be relevant in future conversations.
If there is nothing notable, output an empty response.`;

export async function extractFacts(
  userId: string,
  messages: Message[],
): Promise<string[]> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Being'}: ${m.content}`)
    .join('\n');

  const response = await generateResponse(EXTRACTION_PROMPT, [
    { role: 'user', content: `Conversation:\n${transcript}` },
  ]);

  const facts = response
    .split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(line => line.length > 0);

  await Promise.all(
    facts.map(async fact => {
      const embedding = await embed(fact).catch(() => undefined);
      await upsertEntityFact(userId, fact, 0.7, embedding);
    }),
  );

  return facts;
}
