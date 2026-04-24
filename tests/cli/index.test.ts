// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';
import * as dbModule from '../../src/lib/db.js';

vi.mock('../../src/lib/embed.js', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }));
vi.mock('../../src/lib/entity.js', () => ({ extractFacts: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/dream.js', () => ({
  maybeDream: vi.fn().mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' }),
}));
vi.mock('../../src/lib/db.js', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1', user_id: 'default', created_at: new Date() }),
  saveMessage: vi.fn().mockResolvedValue({}),
  getLatestArtifacts: vi.fn().mockResolvedValue({}),
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

test('startSession calls maybeDream then getLatestArtifacts', async () => {
  const dream = await import('../../src/lib/dream.js');
  const db = await import('../../src/lib/db.js');
  vi.clearAllMocks();

  (db.getLatestArtifacts as any).mockResolvedValue({
    relationalPortrait: 'Devin is an engineer.',
    residue: 'I keep thinking about the droplet.',
  });
  (dream.maybeDream as any).mockResolvedValue({ dreamed: true, capHit: false });

  const mockRl = { question: vi.fn().mockResolvedValueOnce('exit'), close: vi.fn() } as any;
  await startSession('initial', mockRl);

  expect(dream.maybeDream).toHaveBeenCalledWith('default');
  expect(db.getLatestArtifacts).toHaveBeenCalledWith('default');
});

test('startSession works with no artifacts (fresh install)', async () => {
  const db = await import('../../src/lib/db.js');
  const dream = await import('../../src/lib/dream.js');
  vi.clearAllMocks();

  (db.getLatestArtifacts as any).mockResolvedValue({});
  (dream.maybeDream as any).mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' });

  vi.spyOn(llmModule, 'generateResponse').mockResolvedValue('Hello.');

  const mockRl = {
    question: vi.fn().mockResolvedValueOnce('hi').mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await expect(startSession('initial', mockRl)).resolves.not.toThrow();
});
