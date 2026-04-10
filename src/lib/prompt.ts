export function generatePrompt(state: string, budget?: string[] | null) {
  let prompt = `Internal State: ${state}\n`;
  if (budget && budget.length > 0) {
    prompt += `Historical Context: ${budget.join('\n')}\n`;
  }
  prompt += `User: `;
  return prompt;
}
