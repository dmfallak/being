export async function updateState(oldState: string, input: string): Promise<string> {
  // Mock logic: combine strings or use a simple hash
  return `${oldState}-${input.slice(0, 10)}`;
}
