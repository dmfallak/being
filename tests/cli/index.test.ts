// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';

test('startSession calls generateResponse and displays output', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('That is a good question.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const outputLines: string[] = [];
  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
    write: vi.fn((line: string) => { outputLines.push(line); }),
  } as any;

  await startSession('initial', mockRl);

  expect(generateResponseSpy).toHaveBeenCalledOnce();
  const [systemPrompt, messages] = generateResponseSpy.mock.calls[0] as [string, any[]];
  expect(systemPrompt).toContain('scientist');
  expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
});

test('startSession passes budget context into system prompt', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('Interesting.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const mockRl = {
    question: vi.fn().mockResolvedValueOnce('exit'),
    close: vi.fn(),
    write: vi.fn(),
  } as any;

  await startSession('initial', mockRl, ['Alex is anxious about career growth.']);

  expect(generateResponseSpy).not.toHaveBeenCalled(); // exit before first response
});
