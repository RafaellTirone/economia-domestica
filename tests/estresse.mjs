// Teste de estresse ("robô apressado"): usa o app sem parar por muito tempo, com ações aleatórias,
// para achar travamentos, lentidão e erros. Mede o tempo de cada ação, registra travadas da tela
// (tarefas longas do navegador), confere se os totais batem com os dados gravados e procura
// "NaN"/"undefined" na tela. Alterna celular lento (CPU 4x mais lenta), sem internet e muitos dados.
// Uso: npm run build && node tests/estresse.mjs <minutos> <semente> [pasta-de-saida]
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { iniciarServidor, playwright } from './apoio.mjs';

const MINUTOS = Number(process.argv[2] ?? 10);
let semente = Number(process.argv[3] ?? Date.now() % 100000);
const SAIDA = process.argv[4] ?? join(process.cwd(), '.trabalho', 'estresse');
mkdirSync(SAIDA, { recursive: true });
const LOG = join(SAIDA, `rodada-${semente}.jsonl`);
const registrar = (o) => appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');

// Sorteio repetível (mesma semente = mesma sequência, para reproduzir um bug)
const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const um = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const entre = (a, b) => a + Math.floor(aleatorio() * (b - a + 1));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const reais = (c) => `R$ ${Math.floor(c / 100).toLocaleString('pt-BR')},${String(c % 100).padStart(2, '0')}`;
const nb = (s) => s.replace(/ /g, ' ');

const URL_APP = await iniciarServidor(4192 + (Number(process.argv[3] ?? 0) % 50));
const navegador = await playwright.chromium.launch();
// Semente par = celular; ímpar = notebook
const NOTEBOOK = Number(process.argv[3] ?? 0) % 2 === 1;
const ctx = await navegador.newContext(NOTEBOOK
  ? { viewport: { width: 1280, height: 900 }, locale: 'pt-BR', acceptDownloads: true }
  : { viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, acceptDownloads: true });
await ctx.addInitScript(() => {
  window.__longas = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longas.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* sem suporte */ }
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const erros = [];
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });

const DESPESAS = { Moradia: ['Aluguel / financiamento', 'Condomínio'], Alimentação: ['Compra do mês', 'Feira / hortifrúti', 'Açougue', 'Padaria', 'Delivery', 'Restaurante'], Transporte: ['Combustível'], 'Contas da casa': ['Luz', 'Água', 'Internet'], Saúde: ['Farmácia'], Lazer: ['Passeios'], Vestuário: ['Roupas'], Outros: [] };
const RECEITAS = ['Salário', 'Renda extra', 'Outras receitas'];
const TELAS = [['/', 'Envelopes do mês'], ['/lancamentos', 'Lançamentos'], ['/contas', 'Contas do mês'], ['/orcamento', 'Orçamento'], ['/dividas', 'Dívidas'], ['/cofrinhos', 'Cofrinhos'], ['/desejos', 'Desejos e planos'], ['/relatorios', 'Relatórios'], ['/configuracoes', 'Configurações'], ['/categorias', 'Categorias']];
const hoje = new Date();

/** Lê uma tabela inteira do banco do app. */
const ler = (tabela) => page.evaluate((t) => new Promise((ok, falha) => {
  const r = indexedDB.open('economia-domestica');
  r.onsuccess = () => { const q = r.result.transaction(t).objectStore(t).getAll(); q.onsuccess = () => { r.result.close(); ok(q.result); }; q.onerror = () => falha(q.error); };
  r.onerror = () => falha(r.error);
}), tabela);

/** O que a ação estava fazendo (vai junto no registro de erro). */
let detalhe = '';
const passo = (t) => { detalhe = t; };

/** Navega por dentro do app (sem recarregar), como um toque no menu. */
async function irPara(caminho, titulo) {
  passo(`abrir ${caminho} (esperando "${titulo}")`);
  await page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')); }, caminho);
  if (titulo) await page.getByRole('heading', { name: titulo, exact: titulo !== 'Envelopes do mês' }).first().waitFor({ timeout: 15000 });
}

/** Depois de salvar/excluir o app volta para a tela anterior: espera isso acontecer. */
async function esperarSair() {
  passo('esperar voltar para a tela anterior');
  await page.waitForURL((u) => !u.pathname.startsWith('/lancar'), { timeout: 10000 });
}

// ---------------- Ações ----------------
const acoes = {
  async lancarDespesa() {
    await irPara('/lancar', 'Novo lançamento');
    const cat = um(Object.keys(DESPESAS));
    passo(`categoria ${cat}`);
    await page.getByRole('button', { name: cat, exact: true }).click();
    const sub = DESPESAS[cat].length && aleatorio() < 0.7 ? um(DESPESAS[cat]) : null;
    if (sub) { passo(`detalhe ${sub}`); await page.getByRole('button', { name: sub, exact: true }).click(); }
    const centavos = entre(150, aleatorio() < 0.1 ? 900000 : 60000);
    if (aleatorio() < 0.3) {
      // pela calculadora: duas parcelas somadas
      await page.getByRole('button', { name: 'Calculadora' }).click();
      const a = Math.floor(centavos / 2), b = centavos - a;
      await page.keyboard.type(`${(a / 100).toFixed(2).replace('.', ',')}+${(b / 100).toFixed(2).replace('.', ',')}`);
      await page.getByTestId('calculadora').getByRole('button', { name: /^Finalizar/ }).click();
    } else await page.getByLabel('Valor', { exact: true }).fill((centavos / 100).toFixed(2).replace('.', ','));
    await page.getByLabel(/Descrição/).fill(um(['Mercado', 'Padaria do Zé', 'Posto', 'Farmácia', 'Lanche', 'Conta', '', 'Feira', 'Presente']));
    const forma = um(['Pix', 'Débito', 'Dinheiro', 'Crédito']);
    await page.getByRole('button', { name: forma, exact: true }).click();
    if (forma === 'Crédito' && aleatorio() < 0.3) await page.getByLabel('Parcelas no cartão').selectOption(String(entre(2, 12)));
    else if (aleatorio() < 0.08) await page.getByLabel(/Repete todo mês/).check();
    if (aleatorio() < 0.4) await page.locator('#campo-data').fill(iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - entre(-20, 60))));
    passo('salvar e esperar o aviso');
    await page.locator('form button[type=submit]').click();
    await page.getByTestId('aviso').filter({ hasText: /salva/ }).first().waitFor({ timeout: 10000 });
    await esperarSair();
  },
  async lancarReceita() {
    await irPara('/lancar', 'Novo lançamento');
    passo('tocar Recebi');
    await page.getByRole('radio', { name: 'Recebi' }).click();
    const rec = um(RECEITAS);
    passo(`categoria ${rec}`);
    await page.getByRole('button', { name: rec, exact: true }).click();
    await page.getByLabel('Valor', { exact: true }).fill(String(entre(50, 8000)));
    passo('salvar e esperar o aviso');
    await page.locator('form button[type=submit]').click();
    await page.getByTestId('aviso').filter({ hasText: /salva/ }).first().waitFor({ timeout: 10000 });
    await esperarSair();
  },
  async editar() {
    const lista = (await ler('lancamentos')).filter((l) => l.tipo !== 'guardado');
    if (!lista.length) return;
    const l = um(lista);
    await irPara(`/lancar/${l.id}`, 'Editar lançamento');
    await page.getByLabel('Valor', { exact: true }).fill(String(entre(1, 900)));
    if (l.recorrenciaId && aleatorio() < 0.5) await page.getByLabel('Neste e nos próximos meses').check();
    await page.locator('form button[type=submit]').click();
    await page.getByTestId('aviso').filter({ hasText: /Alterações salvas/ }).first().waitFor({ timeout: 10000 });
    await esperarSair();
  },
  async excluir() {
    const lista = (await ler('lancamentos')).filter((l) => l.tipo !== 'guardado');
    if (lista.length < 30) return;
    const l = um(lista);
    await irPara(`/lancar/${l.id}`, 'Editar lançamento');
    await page.getByRole('button', { name: 'Excluir lançamento' }).click();
    if (l.recorrenciaId) await page.getByRole('button', { name: 'Só a deste mês' }).click();
    const aviso = page.getByTestId('aviso').filter({ hasText: /excluí/ }).first();
    await aviso.waitFor({ timeout: 10000 });
    await esperarSair();
    if (aleatorio() < 0.3) await aviso.getByRole('button', { name: 'Desfazer' }).click();
  },
  async ticarConta() {
    await irPara('/contas', 'Contas do mês');
    const caixas = page.getByRole('checkbox');
    const n = await caixas.count();
    if (!n) return;
    await caixas.nth(entre(0, n - 1)).click();
    await page.getByTestId('aviso').first().waitFor({ timeout: 10000 });
  },
  async navegar() {
    const [c, t] = um(TELAS);
    await irPara(c, t);
    if (aleatorio() < 0.4 && await page.getByRole('button', { name: 'Próximo mês' }).count()) await page.getByRole('button', { name: um(['Próximo mês', 'Mês anterior']) }).first().click();
  },
  async relatorios() {
    await irPara('/relatorios', 'Relatórios');
    await page.getByRole('radio', { name: um(['Semanal', 'Mensal', 'Anual']) }).click();
    await page.getByRole('button', { name: um(['Período anterior', 'Próximo período']) }).click();
  },
  async calculadoraSozinha() {
    await irPara('/lancar', 'Novo lançamento');
    await page.getByRole('button', { name: 'Calculadora' }).click();
    await page.keyboard.type(um(['12,5*3-10%=', '100/7=', '5/0', '1,250*42,9+18,9=', '99999999*99999999=', ',,,++--']));
    await page.getByRole('button', { name: 'Fechar calculadora' }).click();
  },
  async recarregar() {
    await page.reload();
    await page.getByRole('heading', { name: 'Envelopes do mês' }).or(page.locator('main h1')).first().waitFor({ timeout: 20000 });
  },
  async semInternet() {
    await ctx.setOffline(true);
    await page.reload();
    await page.locator('main h1').first().waitFor({ timeout: 20000 });
    await acoes.lancarDespesa();
    await ctx.setOffline(false);
  },
  async cofrinho() {
    const cofs = await ler('cofrinhos');
    if (!cofs.length) return;
    await irPara(`/cofrinhos/${um(cofs).id}`, null);
    passo('abrir "Registrar depósito"');
    await page.getByRole('button', { name: 'Registrar depósito' }).click();
    await page.locator('#mov-valor').fill(String(entre(10, 300)));
    await page.locator('form').getByRole('button', { name: 'Registrar depósito' }).click();
    await page.getByTestId('aviso').first().waitFor({ timeout: 10000 });
  },
  async muitosDados() {
    // Simula anos de uso: +2.000 lançamentos espalhados por 5 anos
    await page.evaluate(({ hojeIso }) => new Promise((ok) => {
      const r = indexedDB.open('economia-domestica');
      r.onsuccess = () => {
        const tx = r.result.transaction('lancamentos', 'readwrite');
        const base = new Date(hojeIso);
        for (let i = 0; i < 2000; i++) {
          const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - Math.floor(Math.random() * 1800));
          const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const receita = i % 15 === 0;
          tx.objectStore('lancamentos').add({ tipo: receita ? 'receita' : 'despesa', data, descricao: receita ? 'Salário' : 'Compra antiga', valor: receita ? 450000 : 500 + Math.floor(Math.random() * 30000), categoriaId: receita ? 12 : 1 + Math.floor(Math.random() * 11), forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });
        }
        tx.oncomplete = () => { r.result.close(); ok(); };
      };
    }), { hojeIso: iso(hoje) });
  },
};

const PESOS = [['lancarDespesa', 30], ['lancarReceita', 6], ['editar', 10], ['excluir', 6], ['ticarConta', 8], ['navegar', 25], ['relatorios', 6], ['calculadoraSozinha', 4], ['recarregar', 3], ['semInternet', 2], ['cofrinho', 3]];
const sortearAcao = () => { const total = PESOS.reduce((s, [, p]) => s + p, 0); let x = aleatorio() * total; for (const [n, p] of PESOS) { if ((x -= p) < 0) return n; } return 'navegar'; };

// ---------------- Conferências ----------------
async function conferir() {
  const problemas = [];
  // 1. Tela sem NaN/undefined/Infinity
  const texto = await page.locator('main').innerText().catch(() => '');
  for (const ruim of ['NaN', 'undefined', 'Infinity', '[object Object]']) if (texto.includes(ruim)) problemas.push(`tela mostra "${ruim}" em ${page.url()}`);
  // 2. Total de despesas do mês na Visão geral = soma no banco
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor({ timeout: 20000 });
  const lancs = await ler('lancamentos');
  const mes = iso(hoje).slice(0, 7);
  const despesas = lancs.filter((l) => l.tipo === 'despesa' && l.data.startsWith(mes)).reduce((s, l) => s + l.valor, 0);
  const renda = nb(await page.locator('section[aria-labelledby="titulo-renda"]').innerText());
  if (despesas > 0 && !renda.includes(reais(despesas))) problemas.push(`Despesas do mês na tela não batem: banco ${reais(despesas)} · tela "${renda.replace(/\n/g, ' ')}"`);
  // 3. Conta que se repete não pode aparecer duas vezes no mesmo mês
  const vistos = new Set();
  for (const l of lancs) if (l.recorrenciaId) { const k = `${l.recorrenciaId}|${l.data.slice(0, 7)}`; if (vistos.has(k)) problemas.push(`conta repetida duplicada: ${k}`); vistos.add(k); }
  // 4. Valores sempre inteiros (centavos) e datas válidas
  for (const l of lancs) if (!Number.isSafeInteger(l.valor) || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) problemas.push(`lançamento inválido: ${JSON.stringify(l).slice(0, 120)}`);
  return { problemas, total: lancs.length };
}

// ---------------- Rodada ----------------
await page.goto(URL_APP);
await page.getByRole('button', { name: 'Ver com dados de exemplo' }).click();
await page.getByTestId('resumo-ano').waitFor({ timeout: 20000 });
const fim = Date.now() + MINUTOS * 60_000;
const tempos = {};
const falhas = [];
let feitas = 0, lento = false, muitos = false;
while (Date.now() < fim) {
  // A cada ~100 ações alterna celular rápido / lento; no meio da rodada, anos de dados
  if (feitas % 100 === 0) { lento = !lento; await cdp.send('Emulation.setCPUThrottlingRate', { rate: lento ? 4 : 1 }); }
  if (!muitos && Date.now() > fim - MINUTOS * 30_000) { muitos = true; await acoes.muitosDados(); registrar({ evento: 'muitos-dados' }); }
  const nome = sortearAcao();
  const errosAntes = erros.length;
  detalhe = '';
  // Como uma pessoa: fecha o aviso que ficou na tela antes de seguir
  await page.getByRole('button', { name: 'Fechar aviso' }).click({ timeout: 2000 }).catch(() => {});
  await page.evaluate(() => { window.__longas = []; }).catch(() => {});
  const t0 = Date.now();
  try {
    await acoes[nome]();
    const ms = Date.now() - t0;
    const longas = await page.evaluate(() => window.__longas ?? []).catch(() => []);
    const maior = Math.max(0, ...longas);
    (tempos[nome] ??= []).push(ms);
    registrar({ acao: nome, ms, travadaMaior: maior, lento });
    if (maior > 1500) falhas.push({ tipo: 'travou', acao: nome, ms: maior, url: page.url(), lento });
  } catch (e) {
    const foto = join(SAIDA, `falha-${process.argv[3] ?? 0}-${feitas}.png`);
    await page.screenshot({ path: foto, fullPage: true }).catch(() => {});
    falhas.push({ tipo: 'erro', acao: nome, passo: detalhe, msg: String(e.message).split('\n')[0], url: page.url(), foto, lento });
    registrar({ acao: nome, passo: detalhe, url: page.url(), erro: String(e.message).split('\n')[0] });
    await ctx.setOffline(false);
    await page.goto(URL_APP).catch(() => {});
  }
  if (erros.length > errosAntes) falhas.push({ tipo: 'console', acao: nome, msg: erros.slice(errosAntes).join(' | ').slice(0, 400), url: page.url() });
  feitas++;
  if (feitas % 60 === 0) {
    const c = await conferir().catch((e) => ({ problemas: [`conferência falhou: ${e.message}`], total: 0 }));
    const memoria = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0).catch(() => 0);
    registrar({ conferencia: c.problemas, lancamentos: c.total, memoriaMB: Math.round(memoria / 1e6) });
    for (const p of c.problemas) falhas.push({ tipo: 'dados', msg: p });
  }
}

// ---------------- Resumo ----------------
const pct = (l, p) => { const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const resumo = {
  semente: Number(process.argv[3] ?? 0), minutos: MINUTOS, acoes: feitas,
  tempos: Object.fromEntries(Object.entries(tempos).map(([n, l]) => [n, { vezes: l.length, mediana: pct(l, 0.5), p95: pct(l, 0.95), max: Math.max(...l) }])),
  falhas,
};
writeFileSync(join(SAIDA, `resumo-${resumo.semente}.json`), JSON.stringify(resumo, null, 2));
console.log(JSON.stringify({ acoes: feitas, falhas: falhas.length, tipos: falhas.map((f) => `${f.tipo}:${f.acao ?? ''}:${(f.msg ?? f.ms ?? '').toString().slice(0, 90)}`).slice(0, 15) }, null, 1));
await navegador.close();
process.exit(0);
