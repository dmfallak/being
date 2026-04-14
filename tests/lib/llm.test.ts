import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'I find that fascinating.' }),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn().mockReturnValue('mock-model'),
}));

test('generateResponse returns LLM text and calls SDK with correct args', async () => {
  const { generateText } = await import('ai');
  const { google } = await import('@ai-sdk/google');
  const { generateResponse } = await import('../../src/lib/llm.js');

  const result = await generateResponse('You are a scientist.', [
    { role: 'user', content: 'What is emergence?' },
  ]);

  expect(result).toBe('I find that fascinating.');
  expect(google).toHaveBeenCalledWith('gemini-2.0-flash');
  expect(generateText).toHaveBeenCalledWith({
    model: 'mock-model',
    system: 'You are a scientist.',
    messages: [{ role: 'user', content: 'What is emergence?' }],
  });
});
