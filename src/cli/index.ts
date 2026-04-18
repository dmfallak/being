// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import { embed } from '../lib/embed.js';
import { createConversation, saveMessage, getLatestResidue } from '../lib/db.js';
import { extractFacts } from '../lib/entity.js';
import { buildContextBudget } from '../lib/waking.js';
import { maybeDream } from '../lib/dream.js';
import type { Message } from '../lib/llm.js';

const DEFAULT_USER_ID = 'default';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
  budget?: string[],
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });
  let currentState = initialState;
  const history: Message[] = [];
  let conversationId: string | null = null;

  // Dream on wake (best-effort; never blocks the session on failure).
  const dreamOutcome = await maybeDream(DEFAULT_USER_ID).catch(err => {
    console.error('dream: unexpected error, continuing without residue:', err);
    return { dreamed: false, reason: 'error' as const };
  });
  if (dreamOutcome.dreamed) {
    process.stdout.write('(getting my bearings)\n');
  }

  const residue = await getLatestResidue(DEFAULT_USER_ID).catch(() => null);
  const opener = residue?.prose ?? '';
  const contextBudget = budget ?? await buildContextBudget(DEFAULT_USER_ID, opener).catch(() => []);

  try {
    while (true) {
      let userInput: string;
      try {
        userInput = await interfaceInstance.question('You: ');
      } catch {
        break;
      }

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      if (!conversationId) {
        const conversation = await createConversation(DEFAULT_USER_ID);
        conversationId = conversation.id;
      }

      const userEmbedding = await embed(userInput).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'user', userInput, userEmbedding);

      history.push({ role: 'user', content: userInput });

      const lessonsOfYesterday = residue?.prose;
      const lessonsWithFacts = [
        lessonsOfYesterday,
        contextBudget.length > 0 ? contextBudget.join('\n') : undefined,
      ].filter(Boolean).join('\n\n');

      const systemPrompt = buildSystemPrompt(lessonsWithFacts || undefined);
      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      const assistantEmbedding = await embed(response).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'assistant', response, assistantEmbedding);

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (conversationId && history.length > 0) {
      await extractFacts(DEFAULT_USER_ID, history).catch(err => {
        console.error('Entity extraction failed:', err);
      });
    }
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  startSession('I am alive.').catch(console.error);
}
