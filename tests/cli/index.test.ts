// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';
import * as dbModule from '../../src/lib/db.js';

vi.mock('../../src/lib/embed.js', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }));
vi.mock('../../src/lib/entity.js', () => ({ extractFacts: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/waking.js', () => ({ buildContextBudget: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/dream.js', () => ({
  maybeDream: vi.fn().mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' }),
}));
vi.mock('../../src/lib/db.js', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1', user_id: 'default', created_at: new Date() }),
  saveMessage: vi.fn().mockResolvedValue({}),
  getLatestResidue: vi.fn().mockResolvedValue(null),
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

test('startSession invokes maybeDream and passes residue prose to buildContextBudget', async () => {
  const dream = await import('../../src/lib/dream.js');
  const waking = await import('../../src/lib/waking.js');
  const db = await import('../../src/lib/db.js');
  vi.clearAllMocks();

  (db.getLatestResidue as any).mockResolvedValue({
    id: 'res-1', dream_run_id: 'dr-1', user_id: 'default',
    prose: 'I find myself curious about the migration we discussed.',
    embedding: [0.1, 0.2], created_at: new Date(),
  });
  (dream.maybeDream as any).mockResolvedValue({ dreamed: false, reason: 'rate-limited' });

  const mockRl = { question: vi.fn().mockResolvedValueOnce('exit'), close: vi.fn() } as any;

  await startSession('initial', mockRl);

  expect(dream.maybeDream).toHaveBeenCalledWith('default');
  expect(waking.buildContextBudget).toHaveBeenCalledWith(
    'default',
    'I find myself curious about the migration we discussed.',
  );
});

test('startSession falls back to empty opener when no residue exists', async () => {
  const waking = await import('../../src/lib/waking.js');
  const db = await import('../../src/lib/db.js');
  const dream = await import('../../src/lib/dream.js');
  vi.clearAllMocks();

  (db.getLatestResidue as any).mockResolvedValue(null);
  (dream.maybeDream as any).mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' });

  const mockRl = { question: vi.fn().mockResolvedValueOnce('exit'), close: vi.fn() } as any;

  await startSession('initial', mockRl);

  expect(waking.buildContextBudget).toHaveBeenCalledWith('default', '');
});
