import { expect, test, vi } from 'vitest';

test('config loads GOOGLE_GENERATIVE_AI_API_KEY and DATABASE_URL from env', async () => {
  vi.resetModules();
  process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'test-key';
  process.env['DATABASE_URL'] = 'postgres://localhost/test';
  const { config } = await import('../../src/lib/config.js');
  expect(config.GOOGLE_GENERATIVE_AI_API_KEY).toBe('test-key');
  expect(config.DATABASE_URL).toBe('postgres://localhost/test');
});
