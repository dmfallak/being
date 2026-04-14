import { expect, test } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/seed.js';

test('buildSystemPrompt includes seed character', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('scientist');
  expect(prompt).toContain('humility');
  expect(prompt).toContain('empathy');
});

test('buildSystemPrompt includes morning state when provided', () => {
  const prompt = buildSystemPrompt('I have been thinking about emergence.');
  expect(prompt).toContain('I have been thinking about emergence.');
});

test('buildSystemPrompt omits morning state section when not provided', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).not.toContain('This morning');
});
