// Gera a versão de teste em UM arquivo HTML (scripts, estilos e fontes embutidos),
// para publicar como página de demonstração. Uso: npm run build:previa
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist-previa';
let html = readFileSync(join(DIST, 'index.html'), 'utf8');
const arquivo = (url) => join(DIST, url.replace(/^\.?\//, ''));

// Fontes: só o subconjunto latino (português) entra, como data: URI
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  let css = readFileSync(arquivo(href), 'utf8');
  css = css.replace(/@font-face\{[^}]*\}/g, (bloco) => {
    if (!/latin-wght-normal/.test(bloco) || /latin-ext/.test(bloco)) return '';
    return bloco.replace(/url\(([^)]+\.woff2)\)/, (_m, f) => `url(data:font/woff2;base64,${readFileSync(join(DIST, 'assets', f.split('/').pop())).toString('base64')})`);
  });
  return `<style>${css}</style>`;
});
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) =>
  `<script type="module">${readFileSync(arquivo(src), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="icon"[^>]*>/, '');

// A página é envolvida num esqueleto na publicação: tira doctype/html/head/body
const titulo = html.match(/<title>.*?<\/title>/)[0];
const estilos = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const corpo = html.match(/<body>([\s\S]*)<\/body>/)[1];
const scripts = (html.match(/<script type="module">[\s\S]*?<\/script>/g) || []).join('\n');
const saida = `${titulo}\n<meta name="description" content="Versão de teste do app de economia doméstica">\n${estilos}\n${corpo}\n${scripts}`;
writeFileSync(join(DIST, 'nosso-dinheiro-teste.html'), saida);
console.log(`Gerado ${DIST}/nosso-dinheiro-teste.html (${(saida.length / 1024).toFixed(0)} KB)`);
console.log('Arquivos em assets:', readdirSync(join(DIST, 'assets')).length);
