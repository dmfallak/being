import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
  },
});
