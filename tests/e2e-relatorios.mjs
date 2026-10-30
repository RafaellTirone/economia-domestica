// Auditoria dos Relatórios: semanal, mensal e anual, planilha (CSV/Excel) e PDF (impressão).
// Uso: npm run build && npm run test:e2e
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, hoje, iniciarServidor, iso, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4179);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, acceptDownloads: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));

// Datas de referência: segunda-feira desta semana e da anterior
const d0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
const segunda = new Date(d0); segunda.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6);
const segAnterior = new Date(segunda); segAnterior.setDate(segunda.getDate() - 7);
const ddmmaaaa = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15);

await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
await page.evaluate((d) => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => {
    const tx = req.result.transaction(['lancamentos', 'cofrinhos', 'movimentosCofrinho'], 'readwrite');
    const base = { forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' };
    const add = (data, tipo, valor, categoriaId, descricao) => tx.objectStore('lancamentos').add({ ...base, data, tipo, valor, categoriaId, descricao });
    add(d.segunda, 'despesa', 7250, 2, 'Delivery');
    add(d.segunda, 'despesa', 22000, 3, '=HYPERLINK("http://golpe")');
    add(d.segAnterior, 'despesa', 10000, 2, 'Feira');
    add(d.inicioMes, 'receita', 650000, 12, 'Salário');
    add(d.inicioMes, 'despesa', 165000, 1, 'Aluguel; mês');
    add(d.mesPassado, 'receita', 650000, 12, 'Salário');
    add(d.mesPassado, 'despesa', 500000, 2, 'Mercado');
    tx.objectStore('cofrinhos').add({ nome: 'Reserva de emergência', meta: 500000, prazo: null, ondeGuarda: 'cdb', rendimentoMensal: null, depositoMensal: null, criadoEm: '' });
    tx.objectStore('movimentosCofrinho').add({ cofrinhoId: 1, tipo: 'deposito', valor: 320000, data: d.inicioMes, via: 'manual', lancamentoId: null });
    tx.oncomplete = () => { req.result.close(); ok(); };
  };
}), { segunda: iso(segunda), segAnterior: iso(segAnterior), inicioMes: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), mesPassado: iso(mesPassado) });

// 1. Mensal
await page.goto(`${URL_APP}/relatorios`);
await page.getByTestId('numeros-relatorio').waitFor();
confere('Relatórios: abre (antes era "Em construção")', await page.getByRole('radio', { name: 'Mensal' }).getAttribute('aria-checked') === 'true');
const despesasMes = 165000 + 7250 + 22000 + (segAnterior.getMonth() === hoje.getMonth() ? 10000 : 0) - (segunda.getMonth() !== hoje.getMonth() ? 29250 : 0);
const fmt = (c) => `R$ ${Math.floor(c / 100).toLocaleString('pt-BR')},${String(c % 100).padStart(2, '0')}`;
const numeros = nb(await page.getByTestId('numeros-relatorio').innerText());
confere(`Mensal: receitas R$ 6.500,00 e despesas ${fmt(despesasMes)}`, numeros.includes('R$ 6.500,00') && numeros.includes(fmt(despesasMes)), numeros.replace(/\n/g, ' · '));
confere('Mensal: guardado em cofrinhos aparece separado (R$ 0,00 em lançamentos "Guardei")', numeros.includes('Guardado em cofrinhos'));
const comp = nb(await page.getByTestId('comparacao-mes').innerText());
confere('Mensal: compara com o mês anterior (despesas R$ 5.000,00 no mês passado)', comp.includes('R$ 5.000,00'));
confere('Mensal: gastos por categoria e maiores despesas', await page.getByRole('region', { name: 'Gastos por categoria' }).isVisible() && nb(await page.getByRole('region', { name: 'Maiores despesas' }).innerText()).includes('Aluguel; mês'));
await page.screenshot({ path: join(CAPTURAS, 'relatorio-mensal.png'), fullPage: true });
await verificarTela(page, 'Relatório mensal · celular');

// Planilha do mês (download real)
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Planilha (Excel)' }).click()]);
const csv = readFileSync(await download.path(), 'utf8');
confere('Planilha: nome do arquivo com o mês', /^relatorio-mensal-\d{4}-\d{2}\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
confere('Planilha: padrão Excel (BOM + ponto e vírgula + vírgula decimal)', csv.startsWith('﻿') && csv.includes('Data;Tipo;Descrição') && csv.includes('1650,00'));
confere('Planilha: texto com ";" fica entre aspas', csv.includes('"Aluguel; mês"'));
confere('Planilha: bloqueia fórmula maliciosa (=HYPERLINK vira texto)', csv.includes(`'=HYPERLINK`) || !csv.includes('HYPERLINK'));

// PDF: botão chama a impressão do navegador e a impressão esconde os menus
await page.evaluate(() => { window.__impressoes = 0; window.print = () => { window.__impressoes++; }; });
await page.getByRole('button', { name: 'PDF' }).click();
confere('Botão PDF abre a impressão (salvar como PDF)', (await page.evaluate(() => window.__impressoes)) === 1);
await page.emulateMedia({ media: 'print' });
confere('Na impressão, menus e botões somem (só o relatório)', !(await page.locator('nav.fixed').isVisible()) && !(await page.getByRole('button', { name: 'Planilha (Excel)' }).isVisible()));
await page.emulateMedia({ media: 'screen' });

// 2. Semanal
await page.getByRole('radio', { name: 'Semanal' }).click();
const periodo = await page.getByTestId('periodo-relatorio').innerText();
confere(`Semanal: de segunda a domingo (${ddmmaaaa(segunda)} a ${ddmmaaaa(domingo)})`, periodo.includes(`${ddmmaaaa(segunda)} a ${ddmmaaaa(domingo)}`), periodo);
const nsem = nb(await page.getByTestId('numeros-relatorio').innerText());
confere('Semanal: gastos R$ 292,50 x semana anterior R$ 100,00 (+192,5%)', nsem.includes('R$ 292,50') && nsem.includes('R$ 100,00') && nsem.includes('+192,5%'), nsem.replace(/\n/g, ' · '));
confere('Semanal: frase de comparação', nb(await page.getByTestId('comparacao-semana').innerText()).includes('R$ 192,50 a mais'));
confere('Semanal: categoria que mais pesou (Transporte)', nb(await page.getByRole('region', { name: 'Categorias que mais pesaram' }).innerText()).startsWith('Categorias que mais pesaram\nTransporte'));
await page.screenshot({ path: join(CAPTURAS, 'relatorio-semanal.png'), fullPage: true });
await verificarTela(page, 'Relatório semanal · celular');
await page.getByRole('button', { name: 'Período anterior' }).click();
confere('Semanal: navega para a semana anterior', (await page.getByTestId('periodo-relatorio').innerText()).includes(ddmmaaaa(segAnterior)));

// 3. Anual
await page.getByRole('radio', { name: 'Anual' }).click();
const tabela = nb(await page.getByTestId('tabela-anual').innerText());
confere('Anual: tabela com os 12 meses e total', tabela.split('\n').filter((l) => /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(l)).length === 12 && tabela.includes('Total'));
confere('Anual: média de gastos por mês e total economizado', nb(await page.getByTestId('numeros-relatorio').innerText()).includes('Média de gastos por mês') && nb(await page.getByTestId('numeros-relatorio').innerText()).includes('Economizado no ano'));
confere('Anual: evolução das metas (cofrinho Reserva 64%)', nb(await page.getByTestId('metas-ano').innerText()).replace(/\s+/g, ' ').includes('Reserva de emergência: R$ 3.200,00 de R$ 5.000,00 (64%)'));
await page.screenshot({ path: join(CAPTURAS, 'relatorio-anual.png'), fullPage: true });
await verificarTela(page, 'Relatório anual · celular');
const [down2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Planilha (Excel)' }).click()]);
const csvAno = readFileSync(await down2.path(), 'utf8');
confere('Planilha anual: mês a mês com total', csvAno.includes('Mês;Receitas (R$);Despesas (R$)') && csvAno.includes('Total;'));

// 4. Notebook
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/relatorios`);
await p2.getByRole('heading', { name: 'Relatórios' }).waitFor();
await verificarTela(p2, 'Relatórios · notebook');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de relatórios', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
