// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import type { Message } from '../lib/llm.js';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
  budget?: string[],
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });
  const history: Message[] = [];

  try {
    while (true) {
      const userInput = await interfaceInstance.question('You: ');

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      history.push({ role: 'user', content: userInput });

      const systemPrompt = buildSystemPrompt(
        budget && budget.length > 0 ? budget.join('\n') : undefined,
      );
      const response = await generateResponse(systemPrompt, [...history]);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });
    }
  } finally {
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1]?.endsWith('index.js')) {
  startSession('I am alive.').catch(console.error);
}
