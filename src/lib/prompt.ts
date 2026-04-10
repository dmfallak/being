export function generatePrompt(state: string, budget: string[]) {
  return `Internal State: ${state}\nHistorical Context: ${budget.join('\n')}\nUser: `;
}
