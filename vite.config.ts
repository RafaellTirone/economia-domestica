import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Gera precache.json com todos os arquivos do build (o service worker guarda para funcionar sem internet). */
function listaParaSemInternet(): Plugin {
  return {
    name: 'lista-sem-internet',
    apply: 'build',
    generateBundle(_opcoes, pacote) {
      const arquivos = Object.keys(pacote).filter((n) => !n.endsWith('.map')).map((n) => `/${n}`);
      const publicos = ['/manifest.webmanifest', '/icone.svg', '/icone-180.png', '/icone-192.png', '/icone-512.png', '/icone-maskable-512.png'];
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([...publicos, ...arquivos]) });
    },
  };
}

// Configuração do Vite: React + Tailwind. Tudo é empacotado junto (nada carregado de fora).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'previa' ? [] : [listaParaSemInternet()])],
  define: { __VERSAO__: JSON.stringify(version), __BUILD__: JSON.stringify(Date.now().toString(36)) },
  // assetsInlineLimit 0: nenhuma fonte/imagem embutida como 'data:' — exigido pela trava de segurança (CSP)
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
    // Versão de teste em página única: tudo num arquivo só (inclusive o leitor de PDF)
    rollupOptions: mode === 'previa' ? { output: { inlineDynamicImports: true } } : {},
  },
}));
