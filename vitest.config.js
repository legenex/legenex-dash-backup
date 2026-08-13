import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Scoped to the distribution engine unit tests plus the distribution nav render
// test. The engine is pure and runtime-agnostic; the nav test uses react-dom
// server rendering (no jsdom needed), so the default node environment is correct.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // Recursive on purpose. Narrow per-directory globs meant a test file added
    // anywhere else was silently skipped, which is the same class of problem as
    // a page silently disappearing: green output that proves nothing.
    include: [
      'src/lib/**/*.test.js',
      'src/components/**/*.test.js',
      'src/components/**/*.test.jsx',
    ],
  },
});
