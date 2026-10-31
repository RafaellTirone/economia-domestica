// Testes de ponta a ponta da estrutura do app (navegação, persistência, segurança).
// Uso: npm run build && npm run test:e2e
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, hoje, iniciarServidor, iso, MESES, mesAtual, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4174);

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
  await page.waitForURL('**/dividas', { timeout: 5000 }).catch(() => {});
  await page.getByRole('heading', { level: 1, name: 'Dívidas' }).waitFor({ timeout: 5000 }).catch(() => {});
  confere('Celular: menu leva para Dívidas', page.url().endsWith('/dividas') && (await page.getByRole('heading', { level: 1 }).innerText()) === 'Dívidas');
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  confere('Celular: botão "+" leva para Novo lançamento', page.url().endsWith('/lancar'));
  await page.goBack();
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
  for (const [nome, rota] of [['Lançamentos', '/lancamentos'], ['Dívidas', '/dividas'], ['Cofrinhos', '/cofrinhos'], ['Desejos', '/desejos'], ['Relatórios', '/relatorios'], ['Visão geral', '/']]) {
    await topo.getByRole('link', { name: nome, exact: true }).click();
    await page.waitForURL((u) => new URL(u).pathname === rota, { timeout: 5000 }).catch(() => {});
    await topo.locator(`a[aria-current="page"]`).filter({ hasText: nome }).waitFor({ timeout: 5000 }).catch(() => {});
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
encerrar();
