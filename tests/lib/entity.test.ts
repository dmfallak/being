// tests/lib/entity.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn().mockResolvedValue(
    JSON.stringify([
      { content: 'Alex seems anxious about career growth', category: 'user' },
      { content: 'Alex values directness in conversation', category: 'user' },
    ]),
  ),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/db.js', () => ({
  upsertEntityFact: vi.fn().mockResolvedValue(undefined),
}));

test('extractFacts parses LLM JSON array into categorized facts', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
    { role: 'assistant' as const, content: 'What does stuck feel like for you?' },
  ];
  const facts = await extractFacts('user-1', messages);
  expect(facts).toHaveLength(2);
  expect(facts[0]!.content).toContain('Alex');
  expect(facts[0]!.category).toBe('user');
});

test('extractFacts saves categorized facts to DB', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const { upsertEntityFact } = await import('../../src/lib/db.js');
  vi.clearAllMocks();

  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue(
    JSON.stringify([
      { content: 'Prefers short answers', category: 'user' },
      { content: 'There is a conflict in the region', category: 'world' },
    ]),
  );

  const messages = [{ role: 'user' as const, content: 'hi' }];
  await extractFacts('user-1', messages);
  expect(upsertEntityFact).toHaveBeenCalledTimes(2);
  expect(upsertEntityFact).toHaveBeenCalledWith('user-1', 'Prefers short answers', 0.7, 'user', expect.any(Array));
  expect(upsertEntityFact).toHaveBeenCalledWith('user-1', 'There is a conflict in the region', 0.7, 'world', expect.any(Array));
});

test('extractFacts returns empty array when LLM outputs empty JSON array', async () => {
  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue('[]');
  const { extractFacts } = await import('../../src/lib/entity.js');
  const facts = await extractFacts('user-1', []);
  expect(facts).toHaveLength(0);
});

test('extractFacts falls back to empty array on malformed LLM output', async () => {
  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue('not valid json');
  const { extractFacts } = await import('../../src/lib/entity.js');
  const facts = await extractFacts('user-1', [{ role: 'user', content: 'hi' }]);
  expect(facts).toHaveLength(0);
});
