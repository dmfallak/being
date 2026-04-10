import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { generatePrompt } from '../lib/prompt.js';
import { updateState } from '../lib/ssm.js';

export async function startSession(initialState: string, rl?: readline.Interface, budget?: string[]) {
  const interfaceInstance = rl || readline.createInterface({ input, output });
  let currentState = initialState;

  try {
    while (true) {
      const prompt = generatePrompt(currentState, budget);
      const userInput = await interfaceInstance.question(prompt);

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1]?.endsWith('index.js')) {
  const initialState = 'I am alive.';
  startSession(initialState).catch(console.error);
}
