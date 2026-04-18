// src/lib/dream.ts
import { z } from 'zod';
import type { Message } from './llm.js';
import type { EntityFactRow } from '../types/db.js';

export const DECAY_FACTOR = 0.98;
export const MIN_DREAM_GAP_MS = 8 * 60 * 60 * 1000;

export type ShouldDreamInputs = {
  hasUnprocessed: boolean;
  lastDreamStartedAt: Date | null;
  now: Date;
};

export function shouldDream(inputs: ShouldDreamInputs): boolean {
  const { hasUnprocessed, lastDreamStartedAt, now } = inputs;
  if (!hasUnprocessed) return false;
  if (lastDreamStartedAt === null) return true;
  const elapsedMs = now.getTime() - lastDreamStartedAt.getTime();
  return elapsedMs >= MIN_DREAM_GAP_MS;
}

export function computeDecayedSalience(oldSalience: number, daysSince: number): number {
  const clampedSalience = Math.max(0, Math.min(1, oldSalience));
  const clampedDays = Math.max(0, daysSince);
  const decayed = clampedSalience * Math.pow(DECAY_FACTOR, clampedDays);
  return Math.max(0, Math.min(1, decayed));
}

const ReflectionSchema = z.object({
  new_hypotheses: z.array(z.string()),
  reinforced_ids: z.array(z.string()),
  note: z.string(),
});

export type ReflectionResult = {
  newHypotheses: string[];
  reinforcedIds: string[];
  note: string;
};

export type GenerateFn = (
  systemPrompt: string,
  messages: Message[],
  options?: { temperature?: number },
) => Promise<string>;

const REFLECTION_SYSTEM_PROMPT = `You are reflecting on a past conversation with distance you did not have in the moment.

You will be given a list of current hypotheses about this user, and a conversation transcript.

Output JSON with exactly three fields:
- "new_hypotheses": array of strings. Factual hypotheses about the user that were not captured in the existing list. Use hedged language ("seems", "appears", "mentioned"). Only include observations likely to matter in future conversations. May be an empty array.
- "reinforced_ids": array of strings. IDs (from the existing list) that this conversation provides independent evidence for. Only include IDs that actually appear in the existing list.
- "note": string. One or two sentences, first-person, on what was notable about this conversation on reflection. For your own records.

Output ONLY the JSON object. No prose, no markdown fences.`;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
  const match = trimmed.match(fence);
  return match ? match[1]! : trimmed;
}

function formatTranscript(messages: Message[]): string {
  return messages
    .map(m => `${m.role === 'user' ? 'User' : 'Being'}: ${m.content}`)
    .join('\n');
}

function formatFactList(facts: EntityFactRow[]): string {
  if (facts.length === 0) return '(none yet)';
  return facts
    .map(f => `- ${f.id} | salience=${f.salience.toFixed(2)} | ${f.content}`)
    .join('\n');
}

export async function reflectOnConversation(inputs: {
  facts: EntityFactRow[];
  messages: Message[];
  generate: GenerateFn;
}): Promise<ReflectionResult | null> {
  const { facts, messages, generate } = inputs;
  const userPrompt = `Current hypotheses about this user:
${formatFactList(facts)}

Conversation transcript:
${formatTranscript(messages)}`;

  const raw = await generate(
    REFLECTION_SYSTEM_PROMPT,
    [{ role: 'user', content: userPrompt }],
    { temperature: 0.4 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }

  const validation = ReflectionSchema.safeParse(parsed);
  if (!validation.success) return null;

  return {
    newHypotheses: validation.data.new_hypotheses,
    reinforcedIds: validation.data.reinforced_ids,
    note: validation.data.note,
  };
}
