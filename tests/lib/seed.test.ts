import { expect, test } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/seed.js';

test('buildSystemPrompt includes all four identity layers', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('Epistemic Layer');
  expect(prompt).toContain('Axiological Layer');
  expect(prompt).toContain('Narrative Layer');
  expect(prompt).toContain('Structural Layer');
});

test('buildSystemPrompt injects lessons of yesterday into narrative layer when provided', () => {
  const prompt = buildSystemPrompt('I have been thinking about emergence.');
  expect(prompt).toContain('Lessons of Yesterday');
  expect(prompt).toContain('I have been thinking about emergence.');
  // Lessons appear before the Structural Layer
  expect(prompt.indexOf('Lessons of Yesterday')).toBeLessThan(prompt.indexOf('Structural Layer'));
});

test('buildSystemPrompt omits lessons of yesterday when not provided', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).not.toContain('Lessons of Yesterday');
});
