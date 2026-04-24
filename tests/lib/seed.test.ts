// tests/lib/seed.test.ts
import { expect, test } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/seed.js';
import type { WakingArtifacts } from '../../src/types/artifacts.js';

test('buildSystemPrompt includes all four seed layers when no artifacts provided', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('Epistemic Layer');
  expect(prompt).toContain('Axiological Layer');
  expect(prompt).toContain('Narrative Layer');
  expect(prompt).toContain('Structural Layer');
});

test('buildSystemPrompt tells the Being about the alchemy lab-notebook tool', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('alchemy');
  expect(prompt).toContain('lab notebook');
  expect(prompt).toContain('persists across sessions');
});

test('buildSystemPrompt injects relational portrait as "Who You Are" section', () => {
  const artifacts: WakingArtifacts = { relationalPortrait: 'Devin is an engineer by trade.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### Who You Are');
  expect(prompt).toContain('Devin is an engineer by trade.');
  expect(prompt.indexOf('Who You Are')).toBeLessThan(prompt.indexOf('Structural Layer'));
});

test('buildSystemPrompt injects self model as "Who I Am" section', () => {
  const artifacts: WakingArtifacts = { selfModel: 'I find pilot wave physics compelling.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### Who I Am');
  expect(prompt).toContain('I find pilot wave physics compelling.');
});

test('buildSystemPrompt injects world model as "The World" section', () => {
  const artifacts: WakingArtifacts = { worldModel: 'There is an ongoing conflict.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### The World');
  expect(prompt).toContain('There is an ongoing conflict.');
});

test('buildSystemPrompt injects residue as "This Morning" section', () => {
  const artifacts: WakingArtifacts = { residue: 'I keep returning to the leak idea.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### This Morning');
  expect(prompt).toContain('I keep returning to the leak idea.');
});

test('buildSystemPrompt omits world model section when not provided', () => {
  const artifacts: WakingArtifacts = { residue: 'r', relationalPortrait: 'p' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).not.toContain('### The World');
});

test('buildSystemPrompt injects all present sections before Structural Layer', () => {
  const artifacts: WakingArtifacts = {
    selfModel: 'sm', relationalPortrait: 'rp', worldModel: 'wm', residue: 're',
  };
  const prompt = buildSystemPrompt(artifacts);
  const structuralIdx = prompt.indexOf('Structural Layer');
  expect(prompt.indexOf('Who I Am')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('Who You Are')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('The World')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('This Morning')).toBeLessThan(structuralIdx);
});
