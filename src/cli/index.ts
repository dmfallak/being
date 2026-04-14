// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import { embed } from '../lib/embed.js';
import { createConversation, saveMessage } from '../lib/db.js';
import { extractFacts } from '../lib/entity.js';
import { buildContextBudget } from '../lib/waking.js';
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
  const contextBudget = budget ?? await buildContextBudget(DEFAULT_USER_ID, '').catch(() => []);

  try {
    while (true) {
      let userInput: string;
      try {
        userInput = await interfaceInstance.question('You: ');
      } catch {
        break; // EOF (Ctrl+D) — exit cleanly
      }

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      // Lazy-create conversation on first real message
      if (!conversationId) {
        const conversation = await createConversation(DEFAULT_USER_ID);
        conversationId = conversation.id;
      }

      // Save user message with embedding (non-blocking on failure)
      const userEmbedding = await embed(userInput).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'user', userInput, userEmbedding);

      history.push({ role: 'user', content: userInput });

      const systemPrompt = buildSystemPrompt(
        contextBudget.length > 0 ? contextBudget.join('\n') : undefined,
      );
      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      // Save assistant message with embedding
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
