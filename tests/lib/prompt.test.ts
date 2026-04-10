import { expect, test } from 'vitest';
import { generatePrompt } from '../../src/lib/prompt.js';

test('prompt should include being-state and budget', () => {
  const prompt = generatePrompt('I am calm', ['Memories: yesterday was good']);
  expect(prompt).toContain('I am calm');
  expect(prompt).toContain('yesterday was good');
  expect(prompt).toContain('Historical Context:');
});

test('prompt should skip budget if empty or null', () => {
  const promptEmpty = generatePrompt('I am calm', []);
  expect(promptEmpty).toContain('I am calm');
  expect(promptEmpty).not.toContain('Historical Context:');

  const promptNull = generatePrompt('I am calm', null);
  expect(promptNull).toContain('I am calm');
  expect(promptNull).not.toContain('Historical Context:');

  const promptUndefined = generatePrompt('I am calm');
  expect(promptUndefined).toContain('I am calm');
  expect(promptUndefined).not.toContain('Historical Context:');
});
