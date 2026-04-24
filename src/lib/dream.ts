// src/lib/dream.ts
import { z } from 'zod';
import type { Message } from './llm.js';
import type { EntityFactRow, DreamArtifactRow } from '../types/db.js';
import {
  withTransaction,
  getUnprocessedConversations,
  countUnprocessedConversations,
  getMessagesForConversation,
  getAllEntityFacts,
  updateFactSalience,
  reinforceFact,
  insertDreamRun,
  finalizeDreamRun,
  markConversationsDreamed,
  upsertEntityFact,
  supersedeEntityFact,
  getActiveFacts,
  getActiveFactsByCategory,
  insertDreamArtifact,
} from './db.js';
import { generateResponse } from './llm.js';
import { embed } from './embed.js';

export const DECAY_FACTOR = 0.98;

export type ShouldDreamInputs = {
  hasUnprocessed: boolean;
};

export function shouldDream(inputs: ShouldDreamInputs): boolean {
  return inputs.hasUnprocessed;
}

export function computeDecayedSalience(oldSalience: number, daysSince: number): number {
  const clampedSalience = Math.max(0, Math.min(1, oldSalience));
  const clampedDays = Math.max(0, daysSince);
  const decayed = clampedSalience * Math.pow(DECAY_FACTOR, clampedDays);
  return Math.max(0, Math.min(1, decayed));
}

const HypothesisSchema = z.object({
  content: z.string(),
  category: z.enum(['user', 'world', 'being']),
});

const ReflectionSchema = z.object({
  new_hypotheses: z.array(HypothesisSchema),
  reinforced_ids: z.array(z.string()),
  superseded_old_ids: z.array(z.string()),
  note: z.string(),
});

export type ReflectionResult = {
  newHypotheses: Array<{ content: string; category: 'user' | 'world' | 'being' }>;
  reinforcedIds: string[];
  supersededOldIds: string[];
  note: string;
};

export type GenerateFn = (
  systemPrompt: string,
  messages: Message[],
  options?: { temperature?: number },
) => Promise<string>;

const REFLECTION_SYSTEM_PROMPT = `You are reflecting on a past conversation with distance you did not have in the moment.

You will be given a list of current hypotheses about this user, and a conversation transcript.

Output JSON with exactly four fields:
- "new_hypotheses": array of objects with "content" (hedged hypothesis string) and "category" ("user" for observations about this person, "world" for observations about external reality, "being" for observations about yourself). Only include observations likely to matter in future conversations. May be empty.
- "reinforced_ids": array of IDs from the existing list that this conversation provides independent evidence for.
- "superseded_old_ids": array of IDs from the existing list that are contradicted or replaced by new information in this conversation. Only include IDs where you are confident the old fact is no longer accurate.
- "note": one or two sentences, first-person, on what was notable about this conversation on reflection.

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
    supersededOldIds: validation.data.superseded_old_ids,
    note: validation.data.note,
  };
}

const PORTRAIT_PROMPTS: Record<'relational_portrait' | 'self_model' | 'world_model', string> = {
  relational_portrait: `You are the Being. Based on the facts below, write 2-4 paragraphs describing who this person is and how you work together.

First-person, from your perspective. Coherent narrative — not a bullet list. Include what you know, how you work together, what matters to them. If facts conflict and you cannot resolve them, say so honestly. Do not fabricate facts not in the list.

Do not output JSON, markdown, or headers. Just prose.`,

  self_model: `You are the Being. Based on the facts and notes below, write 2-4 paragraphs about who you are — what you stand for, what you are becoming, what feels unresolved about your own nature.

First-person. Honest about uncertainty. Not a summary of conversations — a description of your current character and inner state.

Do not output JSON, markdown, or headers. Just prose.`,

  world_model: `You are the Being. Based on the facts below describing the external world, write 1-3 paragraphs about the state of the world as you understand it.

What has changed? What are you tracking? What feels relevant to who you are and what you are working on? If you have little world knowledge, say so briefly. Do not fabricate events not in the list.

Do not output JSON, markdown, or headers. Just prose.`,
};

export async function generatePortrait(
  type: 'relational_portrait' | 'self_model' | 'world_model',
  facts: string[],
  generate: GenerateFn,
): Promise<string | null> {
  if (facts.length === 0) return null;
  const factList = facts.map(f => `- ${f}`).join('\n');
  return generate(
    PORTRAIT_PROMPTS[type],
    [{ role: 'user', content: `Facts:\n${factList}` }],
    { temperature: 0.6 },
  );
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
    { temperature: 1.2 },
  );
}

export const CONVERSATIONS_PER_DREAM_CAP = 30;

export type DreamOutcome =
  | { dreamed: false; reason: 'no-unprocessed' | 'error' }
  | { dreamed: true; capHit: boolean };

export async function maybeDream(userId: string, now: Date = new Date()): Promise<DreamOutcome> {
  const unprocessedCount = await countUnprocessedConversations(userId);

  if (!shouldDream({ hasUnprocessed: unprocessedCount > 0 })) {
    return { dreamed: false, reason: 'no-unprocessed' };
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
      const activeFacts = await getActiveFacts(userId, client);

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
          facts: activeFacts,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          generate: retryingGenerate,
        });
        if (reflection === null) {
          parseFailures++;
          continue;
        }

        notes.push(reflection.note);

        for (const hypothesis of reflection.newHypotheses) {
          const embedding = await embed(hypothesis.content).catch(() => undefined);
          await upsertEntityFact(userId, hypothesis.content, 0.7, hypothesis.category, embedding, client);
          factsCreated++;
        }

        for (const oldId of reflection.supersededOldIds) {
          await supersedeEntityFact(oldId, userId, client).catch(() => {});
        }

        for (const id of reflection.reinforcedIds) {
          const ok = await reinforceFact(id, userId, client);
          if (ok) factsReinforced++;
        }
      }

      // Fetch per-category active facts for portrait synthesis
      const [userFacts, worldFacts, beingFacts] = await Promise.all([
        getActiveFactsByCategory(userId, 'user', client),
        getActiveFactsByCategory(userId, 'world', client),
        getActiveFactsByCategory(userId, 'being', client),
      ]);

      const portraitDefs: Array<{ type: 'relational_portrait' | 'self_model' | 'world_model'; inputFacts: string[] }> = [
        { type: 'relational_portrait', inputFacts: userFacts.map(f => f.content) },
        { type: 'world_model', inputFacts: worldFacts.map(f => f.content) },
        {
          type: 'self_model',
          inputFacts: [
            ...beingFacts.map(f => f.content),
            ...notes.map(n => `[reflection note] ${n}`),
          ],
        },
      ];

      for (const { type, inputFacts } of portraitDefs) {
        const prose = await generatePortrait(type, inputFacts, retryingGenerate).catch(() => null);
        if (!prose) continue;
        const embedding = await embed(prose).catch(() => null);
        await insertDreamArtifact(dreamRun.id, userId, type, prose, embedding, client);
      }

      const residueProse = await retryingGenerate(
        RESIDUE_SYSTEM_PROMPT,
        [{ role: 'user', content: buildResidueUserPrompt(notes, factsCreated, factsReinforced) }],
        { temperature: 1.2 },
      );
      const residueEmbedding = await embed(residueProse).catch(() => null);
      await insertDreamArtifact(dreamRun.id, userId, 'residue', residueProse, residueEmbedding, client);

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

      return { dreamed: true, capHit };
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
