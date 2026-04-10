export async function rankContexts(contexts: any[]) {
  return contexts.sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
}
