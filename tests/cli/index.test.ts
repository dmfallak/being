// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';
import * as embedModule from '../../src/lib/embed.js';
import * as dbModule from '../../src/lib/db.js';

vi.mock('../../src/lib/embed.js', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }));
vi.mock('../../src/lib/entity.js', () => ({ extractFacts: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/waking.js', () => ({ buildContextBudget: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/db.js', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1', user_id: 'default', created_at: new Date() }),
  saveMessage: vi.fn().mockResolvedValue({}),
}));

test('startSession persists user and assistant messages', async () => {
  vi.spyOn(llmModule, 'generateResponse').mockResolvedValue('That is fascinating.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await startSession('initial', mockRl);

  expect(dbModule.createConversation).toHaveBeenCalledOnce();
  expect(dbModule.saveMessage).toHaveBeenCalledTimes(2);
  expect(dbModule.saveMessage).toHaveBeenCalledWith('conv-1', 'default', 'user', 'hello', [0.1, 0.2]);
  expect(dbModule.saveMessage).toHaveBeenCalledWith('conv-1', 'default', 'assistant', 'That is fascinating.', [0.1, 0.2]);
});
