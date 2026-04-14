// tests/lib/entity.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn().mockResolvedValue(
    '- Alex seems anxious about career growth\n- Alex values directness in conversation',
  ),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/db.js', () => ({
  upsertEntityFact: vi.fn().mockResolvedValue(undefined),
}));

test('extractFacts parses LLM bullet list into fact strings', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
    { role: 'assistant' as const, content: 'What does stuck feel like for you?' },
  ];
  const facts = await extractFacts('user-1', messages);
  expect(facts).toHaveLength(2);
  expect(facts[0]).toContain('Alex');
});

test('extractFacts saves facts to DB', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const { upsertEntityFact } = await import('../../src/lib/db.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
  ];
  await extractFacts('user-1', messages);
  expect(upsertEntityFact).toHaveBeenCalled();
});
