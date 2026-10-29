import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Configuração do Vite: React + Tailwind. Tudo é empacotado junto (nada carregado de fora).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __VERSAO__: JSON.stringify(version) },
  // assetsInlineLimit 0: nenhuma fonte/imagem embutida como 'data:' — exigido pela trava de segurança (CSP)
  build: { sourcemap: false, assetsInlineLimit: 0 },
});
