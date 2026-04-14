// tests/lib/embed.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
}));

vi.mock('@ai-sdk/google', () => ({
  google: { textEmbeddingModel: vi.fn().mockReturnValue('mock-embed-model') },
}));

test('embed returns a number array', async () => {
  const { google } = await import('@ai-sdk/google');
  const { embed } = await import('../../src/lib/embed.js');
  const result = await embed('hello world');
  expect(Array.isArray(result)).toBe(true);
  expect(result[0]).toBeTypeOf('number');
  expect(google.textEmbeddingModel).toHaveBeenCalledWith('text-embedding-004');
});
