import { expect, test } from 'vitest';
import { updateState } from '../../src/lib/ssm.js';

test('SSM should update hidden state from interaction', async () => {
  const newState = await updateState('old_state', 'user message');
  expect(newState).not.toBe('old_state');
});
