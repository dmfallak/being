import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as promptModule from '../../src/lib/prompt.js';
import * as ssmModule from '../../src/lib/ssm.js';

test('startSession should call generatePrompt and updateState', async () => {
  const generatePromptSpy = vi.spyOn(promptModule, 'generatePrompt');
  const updateStateSpy = vi.spyOn(ssmModule, 'updateState');

  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await startSession('initial', mockRl);

  expect(generatePromptSpy).toHaveBeenCalledWith('initial');
  expect(updateStateSpy).toHaveBeenCalledWith('initial', 'hello');
  expect(generatePromptSpy).toHaveBeenCalledWith('initial-hello');
  expect(mockRl.question).toHaveBeenCalledTimes(2);
});
