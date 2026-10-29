import { defineConfig } from 'vitest/config';

// Testes de regras e cálculos (sem navegador). Os testes de tela ficam em tests/e2e.mjs.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
});
