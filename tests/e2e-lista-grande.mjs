// Mês com muitos lançamentos: a lista desenha 100 de cada vez ("Mostrar mais") e não trava.
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, hoje, iniciarServidor, iso, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4170);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { window.__longas = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longas.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
// 250 lançamentos neste mês
await page.evaluate((mes) => new Promise((ok) => {
  const r = indexedDB.open('economia-domestica');
  r.onsuccess = () => {
    const tx = r.result.transaction('lancamentos', 'readwrite');
    for (let i = 0; i < 250; i++) tx.objectStore('lancamentos').add({ tipo: 'despesa', data: `${mes}-${String(1 + (i % 28)).padStart(2, '0')}`, descricao: `Compra ${i + 1}`, valor: 1000 + i, categoriaId: 2, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });
    tx.oncomplete = () => { r.result.close(); ok(); };
  };
}), iso(hoje).slice(0, 7));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.evaluate(() => { window.__longas = []; });
await page.goto(`${URL_APP}/lancamentos`);
await page.getByTestId('lista-lancamentos').waitFor();
const itens = () => page.getByTestId('lista-lancamentos').getByRole('listitem').count();
confere('Mostra o total certo: 250 lançamentos', nb(await page.getByTestId('lista-lancamentos').innerText()).includes('250 lançamentos'));
confere('Desenha só os primeiros 100', (await itens()) === 100, String(await itens()));
confere('Totais contam os 250 (não só os 100 da tela)', nb(await page.getByLabel('Totais do período').innerText()).includes('R$ 2.811,25'), nb(await page.getByLabel('Totais do período').innerText()));
await page.getByRole('button', { name: /Mostrar mais \(100 de 150 restantes\)/ }).click();
confere('"Mostrar mais" traz mais 100', (await itens()) === 200);
await page.getByRole('button', { name: /Mostrar mais \(50 de 50 restantes\)/ }).click();
confere('No fim, todos os 250 e o botão some', (await itens()) === 250 && (await page.getByRole('button', { name: /Mostrar mais/ }).count()) === 0);
const maior = Math.max(0, ...(await page.evaluate(() => window.__longas)));
confere(`Sem travada longa no celular lento (maior: ${maior} ms)`, maior < 1000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await verificarTela(page, 'Lista grande · celular');
confere('Nenhum erro no console', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
