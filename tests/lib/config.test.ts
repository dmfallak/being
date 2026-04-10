import { expect, test } from 'vitest';
import { config } from '../../src/lib/config.js';

test('config should load from env', () => {
  expect(config.GOOGLE_API_KEY).toBeDefined();
});
