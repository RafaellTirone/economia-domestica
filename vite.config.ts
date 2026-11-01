import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Leitor de texto em fotos (OCR, Tesseract): copia os arquivos dele para /ocr/ no site.
 * Eles NÃO entram no pacote inicial nem na lista do modo sem internet: só são baixados na primeira
 * vez que alguém usa "Foto do recibo" (aí o service worker guarda para as próximas vezes).
 */
const ARQUIVOS_OCR: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  // Português, modelo "best_int": mais preciso e menor (1,4 MB compactado)
  'por.traineddata.gz': 'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz',
};

function leitorDeFotos(): Plugin {
  const raiz = new URL('.', import.meta.url);
  return {
    name: 'leitor-de-fotos',
    // Durante o desenvolvimento: entrega os arquivos direto da node_modules
    configureServer(servidor) {
      servidor.middlewares.use((req, res, seguir) => {
        const nome = req.url?.startsWith('/ocr/') ? req.url.slice(5).split('?')[0] : '';
        if (!ARQUIVOS_OCR[nome]) return seguir();
        res.setHeader('Content-Type', nome.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(new URL(ARQUIVOS_OCR[nome], raiz)));
      });
    },
    generateBundle() {
      for (const [nome, origem] of Object.entries(ARQUIVOS_OCR)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${nome}`, source: readFileSync(new URL(origem, raiz)) });
      }
    },
  };
}

/** Gera precache.json com todos os arquivos do build (o service worker guarda para funcionar sem internet). */
function listaParaSemInternet(): Plugin {
  return {
    name: 'lista-sem-internet',
    apply: 'build',
    generateBundle(_opcoes, pacote) {
      const arquivos = Object.keys(pacote).filter((n) => !n.endsWith('.map') && !n.startsWith('ocr/')).map((n) => `/${n}`);
      const publicos = ['/manifest.webmanifest', '/icone.svg', '/icone-180.png', '/icone-192.png', '/icone-512.png', '/icone-maskable-512.png'];
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([...publicos, ...arquivos]) });
    },
  };
}

// Configuração do Vite: React + Tailwind. Tudo é empacotado junto (nada carregado de fora).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'previa' ? [] : [leitorDeFotos(), listaParaSemInternet()])],
  define: { __VERSAO__: JSON.stringify(version), __BUILD__: JSON.stringify(Date.now().toString(36)) },
  // assetsInlineLimit 0: nenhuma fonte/imagem embutida como 'data:' — exigido pela trava de segurança (CSP)
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
    // Versão de teste em página única: tudo num arquivo só (inclusive o leitor de PDF)
    rollupOptions: mode === 'previa' ? { output: { inlineDynamicImports: true } } : {},
  },
}));
