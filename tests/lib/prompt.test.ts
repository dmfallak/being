import { expect, test } from 'vitest';
import { generatePrompt } from '../../src/lib/prompt.js';

test('prompt should include being-state and budget', () => {
  const prompt = generatePrompt('I am calm', ['Memories: yesterday was good']);
  expect(prompt).toContain('I am calm');
  expect(prompt).toContain('yesterday was good');
});
