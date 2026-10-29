// Testes de ponta a ponta: abre o app de verdade no navegador (Chromium), no celular e no notebook.
// O servidor de teste aplica as MESMAS travas de segurança do Netlify (lidas do netlify.toml),
// então qualquer tentativa de carregar algo de fora ou enviar dados é detectada.
// Uso: npm run build && npm run test:e2e
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const CAPTURAS = join(RAIZ, 'tests', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });

// ---------- servidor estático com os cabeçalhos do netlify.toml ----------
const toml = readFileSync(join(RAIZ, 'netlify.toml'), 'utf8');
const cabecalhos = Object.fromEntries([...toml.matchAll(/^\s+([A-Za-z-]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]]));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const servidor = createServer((req, res) => {
  let arquivo = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(DIST, 'index.html'); // rotas do app
  res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', ...cabecalhos });
  res.end(readFileSync(arquivo));
});
await new Promise((ok) => servidor.listen(4174, ok));
const URL_APP = 'http://localhost:4174';

// ---------- utilidades ----------
const resultados = [];
function confere(nome, ok, detalhe = '') {
  resultados.push({ nome, ok });
  console.log(`${ok ? 'OK    ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const hoje = new Date();
const mesAtual = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nb = (s) => s.replace(/ /g, ' ');

/** Verificações de acessibilidade e layout que valem para qualquer tela. */
async function verificarTela(page, nome) {
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

const navegador = await playwright.chromium.launch();

// ================= CELULAR =================
{
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errosConsole = [];
  page.on('console', (m) => m.type() === 'error' && errosConsole.push(m.text()));
  page.on('pageerror', (e) => errosConsole.push(e.message));
  const externas = [];
  page.on('request', (r) => !r.url().startsWith(URL_APP) && !r.url().startsWith('data:') && externas.push(r.url()));

  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  confere('Celular: abre na Visão geral do mês atual', (await page.getByRole('heading', { level: 1 }).innerText()).toLowerCase() === mesAtual);
  confere('Celular: mostra os 11 envelopes de despesa', (await page.locator('section[aria-labelledby="titulo-envelopes"] li').count()) === 11);
  confere('Celular: valores começam em R$ 0,00', nb(await page.locator('section[aria-labelledby="titulo-renda"]').innerText()).includes('R$ 0,00'));
  confere('Celular: menu inferior visível e topo do notebook oculto',
    await page.locator('nav.fixed').isVisible() && !(await page.locator('header.hidden.md\\:block').isVisible()));
  await page.screenshot({ path: join(CAPTURAS, 'celular-inicio-vazio.png') });
  await verificarTela(page, 'Celular · Início');

  // Trocar o mês
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  confere('Celular: botão "Próximo mês" funciona', (await page.getByRole('heading', { level: 1 }).innerText()).toLowerCase() === `${MESES[prox.getMonth()]} de ${prox.getFullYear()}`);
  await page.getByRole('button', { name: 'Mês anterior' }).click();

  // Navegação pelo menu inferior
  await page.locator('nav.fixed').getByRole('link', { name: 'Dívidas' }).click();
  confere('Celular: menu leva para Dívidas', page.url().endsWith('/dividas') && (await page.getByRole('heading', { level: 1 }).innerText()) === 'Dívidas');
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  confere('Celular: botão "+" leva para Novo lançamento', page.url().endsWith('/lancar'));
  await page.getByRole('button', { name: 'Mais' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Mais opções' });
  confere('Celular: "Mais" abre o painel de opções', await dialogo.isVisible());
  await page.screenshot({ path: join(CAPTURAS, 'celular-menu-mais.png') });
  await page.keyboard.press('Escape');
  confere('Celular: tecla Esc fecha o painel', !(await dialogo.isVisible()));
  await page.getByRole('button', { name: 'Mais' }).click();
  await dialogo.getByRole('link', { name: 'Configurações' }).click();
  await page.getByRole('heading', { name: /Categorias \(14\)/ }).waitFor();
  confere('Celular: Configurações lista 14 categorias padrão', true);
  confere('Celular: categorias de despesa e receita separadas', (await page.getByText('Compra do mês', { exact: false }).count()) > 0 && (await page.getByText('Salário', { exact: true }).count()) > 0);
  await page.screenshot({ path: join(CAPTURAS, 'celular-configuracoes.png'), fullPage: true });
  await verificarTela(page, 'Celular · Configurações');

  // Persistência: grava dados direto no banco do navegador, recarrega e confere.
  const dataHoje = iso(hoje);
  await page.evaluate((data) => new Promise((ok, erro) => {
    const req = indexedDB.open('economia-domestica');
    req.onerror = () => erro(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('lancamentos', 'readwrite');
      const base = { data, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: new Date().toISOString() };
      tx.objectStore('lancamentos').add({ ...base, tipo: 'receita', descricao: 'Salário', valor: 650000, categoriaId: 12 });
      tx.objectStore('lancamentos').add({ ...base, tipo: 'despesa', descricao: 'Aluguel', valor: 165000, categoriaId: 1 });
      tx.objectStore('lancamentos').add({ ...base, tipo: 'guardado', descricao: 'Reserva', valor: 50000, categoriaId: 1 });
      tx.oncomplete = () => { req.result.close(); ok(); };
    };
  }), dataHoje);
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  const renda = nb(await page.locator('section[aria-labelledby="titulo-renda"]').innerText());
  confere('Persistência: dados continuam após recarregar', renda.includes('R$ 6.500,00'), renda.replace(/\n/g, ' · '));
  confere('Resumo: saldo = receitas − despesas (R$ 4.850,00)', renda.includes('R$ 4.850,00'));
  confere('Resumo: guardar no cofrinho NÃO vira despesa', renda.includes('R$ 1.650,00') && renda.includes('R$ 500,00'));
  confere('Resumo: % economizado com vírgula (74,6%)', renda.includes('74,6%'));
  const primeiro = nb(await page.locator('section[aria-labelledby="titulo-envelopes"] li').first().innerText());
  confere('Envelopes: maior gasto aparece primeiro (Moradia R$ 1.650,00)', primeiro.startsWith('Moradia') && primeiro.includes('R$ 1.650,00'));
  // Capturas como a pessoa vê na tela (topo e fim da página), não a página inteira "esticada".
  await page.screenshot({ path: join(CAPTURAS, 'celular-inicio-topo.png') });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(CAPTURAS, 'celular-inicio-fim.png') });
  const cobertura = await page.evaluate(() => {
    const ultimo = [...document.querySelectorAll('section[aria-labelledby="titulo-envelopes"] li')].pop().getBoundingClientRect();
    const menu = document.querySelector('nav.fixed').getBoundingClientRect();
    return { fimConteudo: Math.round(ultimo.bottom), topoMenu: Math.round(menu.top), fundoMenu: Math.round(menu.bottom), altura: innerHeight };
  });
  confere('Menu do celular: encostado na borda de baixo da tela', cobertura.fundoMenu === cobertura.altura, JSON.stringify(cobertura));
  confere('Menu do celular: não cobre o último item ao rolar até o fim', cobertura.fimConteudo <= cobertura.topoMenu, JSON.stringify(cobertura));
  await page.reload();
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  const qtdCategorias = await page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open('economia-domestica');
    req.onsuccess = () => { const c = req.result.transaction('categorias').objectStore('categorias').count(); c.onsuccess = () => { req.result.close(); ok(c.result); }; };
  }));
  confere('Persistência: categorias não duplicam ao reabrir', qtdCategorias === 14, `${qtdCategorias} categorias`);

  confere('Segurança: nenhuma requisição para fora do app', externas.length === 0, externas.join(', '));
  confere('Segurança: nenhum erro no console (inclui bloqueios da trava CSP)', errosConsole.length === 0, errosConsole.join(' | '));
  await ctx.close();
}

// ================= NOTEBOOK =================
{
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const errosConsole = [];
  page.on('console', (m) => m.type() === 'error' && errosConsole.push(m.text()));
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  confere('Notebook: menu no topo visível e menu do celular oculto',
    await page.locator('header.hidden.md\\:block').isVisible() && !(await page.locator('nav.fixed').isVisible()));
  await page.screenshot({ path: join(CAPTURAS, 'notebook-inicio.png'), fullPage: true });
  await verificarTela(page, 'Notebook · Início');
  const topo = page.locator('header.hidden.md\\:block');
  for (const [nome, rota] of [['Gastos', '/gastos'], ['Dívidas', '/dividas'], ['Cofrinhos', '/cofrinhos'], ['Desejos', '/desejos'], ['Relatórios', '/relatorios'], ['Visão geral', '/']]) {
    await topo.getByRole('link', { name: nome, exact: true }).click();
    const atual = await topo.getByRole('link', { name: nome, exact: true }).getAttribute('aria-current');
    confere(`Notebook: menu "${nome}" abre ${rota} e fica marcado`, new URL(page.url()).pathname === rota && atual === 'page');
  }
  await topo.getByRole('link', { name: 'Lançar' }).click();
  confere('Notebook: botão "+ Lançar" abre Novo lançamento', page.url().endsWith('/lancar'));
  await page.goto(`${URL_APP}/configuracoes`);
  confere('Notebook: endereço direto (/configuracoes) funciona', (await page.getByRole('heading', { level: 1 }).innerText()) === 'Configurações');
  await verificarTela(page, 'Notebook · Configurações');
  confere('Notebook: nenhum erro no console', errosConsole.length === 0, errosConsole.join(' | '));
  await ctx.close();
}

// ================= NOTEBOOK ESTREITO / TABLET =================
{
  const ctx = await navegador.newContext({ viewport: { width: 768, height: 1024 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  await verificarTela(page, 'Tablet 768px · Início');
  await ctx.close();
}

await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
