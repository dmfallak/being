// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import { embed } from '../lib/embed.js';
import { createConversation, saveMessage, getLatestArtifacts, db } from '../lib/db.js';
import { closeDriver } from '../lib/neo4j.js';
import { maybeDream } from '../lib/dream.js';
import type { Message } from '../lib/llm.js';

const DEFAULT_USER_ID = 'default';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });

  if (!rl) {
    process.once('SIGINT', () => {
      process.stdout.write('\n(Session ended)\n');
      interfaceInstance.close();
      process.exit(0);
    });
  }
  let currentState = initialState;
  const history: Message[] = [];
  let conversationId: string | null = null;

  const dreamOutcome = await maybeDream(DEFAULT_USER_ID).catch(err => {
    console.error('dream: unexpected error, continuing without residue:', err);
    return { dreamed: false, reason: 'error' as const };
  });
  if (dreamOutcome.dreamed) {
    process.stdout.write('(getting my bearings)\n');
  }

  const artifacts = await getLatestArtifacts(DEFAULT_USER_ID).catch(() => ({}));
  const systemPrompt = buildSystemPrompt(artifacts);

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

      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      const assistantEmbedding = await embed(response).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'assistant', response, assistantEmbedding);

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (!rl) {
      interfaceInstance.close();
    }
    await Promise.all([closeDriver(), db.end()]).catch(() => {});
  }
}

if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  startSession('I am alive.').catch(console.error);
}
