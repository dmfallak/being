import { expect, test, vi, beforeEach } from 'vitest';

const spawnSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

beforeEach(() => {
  spawnSyncMock.mockReset();
});

test('alchemyTool execute spawns alchemy CLI with cwd set to ALCHEMIST_ROOT and returns stdout/stderr/exitCode', async () => {
  process.env.ALCHEMIST_ROOT = '/tmp/fake-alchemist';
  spawnSyncMock.mockReturnValue({ stdout: 'EXP-001\n', stderr: '', status: 0 });

  const { alchemyTool } = await import('../../src/lib/tools.js');
  const result = await (alchemyTool as any).execute({ args: ['list', 'experiments'] });

  expect(result).toEqual({ stdout: 'EXP-001\n', stderr: '', exitCode: 0 });
  const [cmd, argv, opts] = spawnSyncMock.mock.calls[0];
  expect(cmd).toBe('npx');
  expect(argv).toEqual(['tsx', '/tmp/fake-alchemist/src/cli/index.ts', 'list', 'experiments']);
  expect(opts.cwd).toBe('/tmp/fake-alchemist');
  expect(opts.encoding).toBe('utf8');
});

test('alchemyTool returns empty strings when spawn produces no output', async () => {
  spawnSyncMock.mockReturnValue({ stdout: undefined, stderr: undefined, status: 1 });

  const { alchemyTool } = await import('../../src/lib/tools.js');
  const result = await (alchemyTool as any).execute({ args: ['bogus'] });

  expect(result).toEqual({ stdout: '', stderr: '', exitCode: 1 });
});
