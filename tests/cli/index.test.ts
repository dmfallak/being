// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';

test('startSession calls generateResponse with seed system prompt and user message', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('That is a good question.');

  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await startSession('initial', mockRl);

  expect(generateResponseSpy).toHaveBeenCalledOnce();
  const [systemPrompt, messages] = generateResponseSpy.mock.calls[0] as [string, any[]];
  expect(systemPrompt).toContain('scientist');
  expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
});

test('startSession injects budget into system prompt', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('Interesting.');

  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await startSession('initial', mockRl, ['Alex is anxious about career growth.']);

  expect(generateResponseSpy).toHaveBeenCalledOnce();
  const [systemPrompt] = generateResponseSpy.mock.calls[0] as [string, any[]];
  expect(systemPrompt).toContain('Alex is anxious about career growth.');
});
