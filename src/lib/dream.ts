// src/lib/dream.ts
import { z } from 'zod';
import type { Message } from './llm.js';
import type { EntityFactRow, DreamArtifactRow } from '../types/db.js';
import {
  withTransaction,
  getLatestDreamRun,
  getUnprocessedConversations,
  countUnprocessedConversations,
  getMessagesForConversation,
  getAllEntityFacts,
  updateFactSalience,
  reinforceFact,
  insertDreamRun,
  finalizeDreamRun,
  insertDreamResidue,
  markConversationsDreamed,
  upsertEntityFact,
} from './db.js';
import { generateResponse } from './llm.js';
import { embed } from './embed.js';

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

const RESIDUE_SYSTEM_PROMPT = `You are the Being. You have just finished reflecting on recent conversations.

Write 1-3 short paragraphs in your own voice about what is on your mind this morning. First-person. Honest about uncertainty. Do not inventory what happened. Reflect: what are you noticing, what are you curious about, what feels unresolved. It is fine and good to say you are not sure where something came from.

Do not output JSON, markdown, or headers. Just prose.`;

function buildResidueUserPrompt(notes: string[], factsCreated: number, factsReinforced: number): string {
  const notesBlock = notes.length > 0 ? notes.map(n => `- ${n}`).join('\n') : '(no notes)';
  return `Notes you took during reflection:
${notesBlock}

Substrate change during reflection: ${factsCreated} new hypothes${factsCreated === 1 ? 'is' : 'es'}, ${factsReinforced} reinforced.`;
}

export async function generateResidue(inputs: {
  notes: string[];
  factsCreatedCount: number;
  factsReinforcedCount: number;
  generate: GenerateFn;
}): Promise<string> {
  return inputs.generate(
    RESIDUE_SYSTEM_PROMPT,
    [{ role: 'user', content: buildResidueUserPrompt(inputs.notes, inputs.factsCreatedCount, inputs.factsReinforcedCount) }],
    { temperature: 1.0 },
  );
}

export const CONVERSATIONS_PER_DREAM_CAP = 30;

export type DreamOutcome =
  | { dreamed: false; reason: 'no-unprocessed' | 'rate-limited' | 'error' }
  | { dreamed: true; residue: DreamArtifactRow; capHit: boolean };

export async function maybeDream(userId: string, now: Date = new Date()): Promise<DreamOutcome> {
  const [unprocessedCount, lastDream] = await Promise.all([
    countUnprocessedConversations(userId),
    getLatestDreamRun(userId),
  ]);

  if (!shouldDream({
    hasUnprocessed: unprocessedCount > 0,
    lastDreamStartedAt: lastDream?.started_at ?? null,
    now,
  })) {
    return {
      dreamed: false,
      reason: unprocessedCount === 0 ? 'no-unprocessed' : 'rate-limited',
    };
  }

  return runDream(userId, now);
}

async function generateWithRetry(
  systemPrompt: string,
  messages: Message[],
  options: { temperature?: number } | undefined,
  generate: GenerateFn,
): Promise<string> {
  try {
    return await generate(systemPrompt, messages, options);
  } catch {
    await new Promise(r => setTimeout(r, 1000));
    return generate(systemPrompt, messages, options);
  }
}

async function runDream(userId: string, now: Date): Promise<DreamOutcome> {
  const retryingGenerate: GenerateFn = (sys, msgs, opts) =>
    generateWithRetry(sys, msgs, opts, generateResponse);

  try {
    return await withTransaction(async (client) => {
      const dreamRun = await insertDreamRun(userId, now, client);

      const conversations = await getUnprocessedConversations(userId, CONVERSATIONS_PER_DREAM_CAP, client);
      const totalUnprocessed = await countUnprocessedConversations(userId, client);
      const capHit = totalUnprocessed > CONVERSATIONS_PER_DREAM_CAP;

      const facts = await getAllEntityFacts(userId, client);

      for (const fact of facts) {
        const daysSince = (now.getTime() - fact.last_reinforced_at.getTime()) / (24 * 60 * 60 * 1000);
        const newSalience = computeDecayedSalience(fact.salience, daysSince);
        await updateFactSalience(fact.id, userId, newSalience, client);
        fact.salience = newSalience;
      }

      const notes: string[] = [];
      let factsCreated = 0;
      let factsReinforced = 0;
      let parseFailures = 0;

      for (const conv of conversations) {
        const messages = await getMessagesForConversation(conv.id, client);
        const reflection = await reflectOnConversation({
          facts,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          generate: retryingGenerate,
        });
        if (reflection === null) {
          parseFailures++;
          continue;
        }

        notes.push(reflection.note);

        for (const hypothesis of reflection.newHypotheses) {
          const embedding = await embed(hypothesis).catch(() => undefined);
          await upsertEntityFact(userId, hypothesis, 0.7, embedding, client);
          factsCreated++;
        }

        for (const id of reflection.reinforcedIds) {
          const ok = await reinforceFact(id, userId, client);
          if (ok) factsReinforced++;
        }
      }

      const prose = await retryingGenerate(
        RESIDUE_SYSTEM_PROMPT,
        [{ role: 'user', content: buildResidueUserPrompt(notes, factsCreated, factsReinforced) }],
        { temperature: 1.0 },
      );
      const residueEmbedding = await embed(prose).catch(() => null);

      const residue = await insertDreamResidue(
        dreamRun.id,
        userId,
        prose,
        residueEmbedding,
        client,
      );

      await markConversationsDreamed(conversations.map(c => c.id), client);

      await finalizeDreamRun(
        dreamRun.id,
        {
          conversations_processed: conversations.length,
          facts_created: factsCreated,
          facts_reinforced: factsReinforced,
          cap_hit: capHit,
          parse_failures: parseFailures,
          error: null,
        },
        client,
      );

      return { dreamed: true, residue, capHit };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      const auditRun = await insertDreamRun(userId, now);
      await finalizeDreamRun(auditRun.id, {
        conversations_processed: 0,
        facts_created: 0,
        facts_reinforced: 0,
        cap_hit: false,
        parse_failures: 0,
        error: message,
      });
    } catch (auditErr) {
      console.error('dream: failed to record failure audit row:', auditErr);
    }
    return { dreamed: false, reason: 'error' };
  }
}
