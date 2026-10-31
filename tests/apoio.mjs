// Apoio aos testes de ponta a ponta: servidor com as travas do Netlify, conferências e verificações de tela.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
export const CAPTURAS = join(RAIZ, 'tests', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });

// ---------- servidor estático com os cabeçalhos do netlify.toml ----------
const toml = readFileSync(join(RAIZ, 'netlify.toml'), 'utf8');
// Lê cada bloco [[headers]] com o seu "for" (como o Netlify): "/*" vale para tudo; caminhos exatos sobrepõem
const blocosCabecalhos = toml.split('[[headers]]').slice(1).map((b) => ({
  para: (b.match(/for = "([^"]+)"/) || [])[1],
  valores: Object.fromEntries([...b.matchAll(/^\s+([A-Za-z-]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]])),
}));
const cabecalhosPara = (caminho) => Object.assign({}, ...blocosCabecalhos.filter((b) => b.para === '/*' || b.para === caminho).map((b) => b.valores));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
export const servidor = createServer((req, res) => {
  let arquivo = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(DIST, 'index.html'); // rotas do app
  res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', ...cabecalhosPara(req.url.split('?')[0]) });
  res.end(readFileSync(arquivo));
});


// ---------- utilidades ----------
export const resultados = [];
export function confere(nome, ok, detalhe = '') {
  resultados.push({ nome, ok });
  console.log(`${ok ? 'OK    ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const hoje = new Date();
export const mesAtual = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const nb = (s) => s.replace(/ /g, ' ');

/** Verificações de acessibilidade e layout que valem para qualquer tela. */
export async function verificarTela(page, nome) {
  const r = await page.evaluate(() => {
    const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    function fundo(el) {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor); const a = c.length > 3 ? c[3] : 1;
        if (!c.length || a === 0) continue;
        if (a >= 1) return c.slice(0, 3);
        const baixo = fundo(e.parentElement) || [255, 255, 255];
        return c.slice(0, 3).map((v, i) => a * v + (1 - a) * baixo[i]);
      }
      return [255, 255, 255];
    }
    const visivel = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; };
    const out = { transbordo: document.documentElement.scrollWidth - innerWidth, pequenos: [], semNome: [], contraste: [] };
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      if (!visivel(el) || el.closest('.sr-only')) continue;
      const b = el.getBoundingClientRect();
      if (b.height < 44 && el.type !== 'checkbox') out.pequenos.push(`${el.tagName} "${(el.innerText || el.getAttribute('aria-label') || '').trim()}" ${Math.round(b.height)}px`);
      if (!(el.innerText || '').trim() && !el.getAttribute('aria-label') && !(el.labels && el.labels.length)) out.semNome.push(el.outerHTML.slice(0, 60));
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const vistos = new Set();
    while (w.nextNode()) {
      const el = w.currentNode.parentElement;
      if (!w.currentNode.textContent.trim() || vistos.has(el) || !visivel(el) || el.closest('svg, .sr-only')) continue;
      vistos.add(el);
      const cs = getComputedStyle(el); const px = parseFloat(cs.fontSize);
      const [a, b] = [lum(parse(cs.color).slice(0, 3)), lum(fundo(el))].sort((x, y) => y - x);
      const c = (a + 0.05) / (b + 0.05);
      const minimo = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5;
      if (c < minimo) out.contraste.push(`"${w.currentNode.textContent.trim().slice(0, 30)}" ${c.toFixed(2)}:1`);
    }
    return out;
  });
  confere(`${nome}: sem rolagem horizontal`, r.transbordo <= 0, r.transbordo > 0 ? `${r.transbordo}px` : '');
  confere(`${nome}: botões e links com ≥ 44px`, r.pequenos.length === 0, r.pequenos.join(' | '));
  confere(`${nome}: todo botão/link tem nome acessível`, r.semNome.length === 0, r.semNome.join(' | '));
  confere(`${nome}: contraste de texto (WCAG AA)`, r.contraste.length === 0, r.contraste.join(' | '));
}


/** Sobe o servidor de teste numa porta e devolve o endereço. */
export async function iniciarServidor(porta) {
  await new Promise((ok) => servidor.listen(porta, ok));
  return `http://localhost:${porta}`;
}

/** Mostra o resumo e encerra com erro se algo falhou. */
export function encerrar() {
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações passaram.`);
  servidor.close();
  process.exit(falhas.length ? 1 : 0);
}
