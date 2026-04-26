import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    restoreMocks: true,
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
  },
});
