// src/lib/prompt.ts
import { buildSystemPrompt } from './seed.js';

export function generatePrompt(state: string, budget?: string[] | null): string {
  let prompt = buildSystemPrompt();
  if (budget && budget.length > 0) {
    prompt += `\n\nHistorical Context: ${budget.join('\n')}`;
  }
  prompt += `\n\nInternal State: ${state}\nUser: `;
  return prompt;
}
