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
  expect(google).toHaveBeenCalledWith('gemini-3-flash-preview');
  expect(generateText).toHaveBeenCalledWith({
    model: 'mock-model',
    system: 'You are a scientist.',
    messages: [{ role: 'user', content: 'What is emergence?' }],
  });
});

test('generateResponse forwards temperature to generateText when provided', async () => {
  const { generateText } = await import('ai');
  const { generateResponse } = await import('../../src/lib/llm.js');

  (generateText as any).mockClear();

  await generateResponse('sys', [{ role: 'user', content: 'hi' }], { temperature: 0.4 });

  const call = (generateText as any).mock.calls.at(-1)[0];
  expect(call).toHaveProperty('temperature', 0.4);
  expect(call.system).toBe('sys');
  expect(call.messages).toEqual([{ role: 'user', content: 'hi' }]);
});

test('generateResponse omits temperature when not provided', async () => {
  const { generateText } = await import('ai');
  const { generateResponse } = await import('../../src/lib/llm.js');

  (generateText as any).mockClear();

  await generateResponse('sys', [{ role: 'user', content: 'hi' }]);

  const call = (generateText as any).mock.calls.at(-1)[0];
  expect(call).not.toHaveProperty('temperature');
});
