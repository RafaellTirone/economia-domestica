// Auditoria dos dados de exemplo (carregar, apagar só eles) e do "Apagar tudo".
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4190);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const aviso = () => page.getByTestId('aviso');
const contar = () => page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('economia-domestica');
  r.onsuccess = () => { const q = r.result.transaction('lancamentos').objectStore('lancamentos').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result); }; };
}));

// 1. App vazio oferece os exemplos
await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
await page.getByRole('button', { name: 'Ver com dados de exemplo' }).click();
await aviso().filter({ hasText: 'Dados de exemplo carregados' }).waitFor();
await page.getByTestId('resumo-ano').waitFor();
const lancs = await contar();
confere('Exemplos carregados: mais de 50 lançamentos, todos marcados', lancs.length > 50 && lancs.every((l) => l.exemplo), String(lancs.length));
confere('Visão geral passa a mostrar o ano e a barra "Para onde foi"', await page.getByTestId('resumo-ano').isVisible());
await verificarTela(page, 'Visão geral com exemplos · celular');

// 2. Exemplos aparecem nas outras telas
await page.goto(`${URL_APP}/dividas`);
await page.getByText('Empréstimo pessoal').first().waitFor();
confere('Dívidas mostra o "Empréstimo pessoal" de exemplo', true);
await page.goto(`${URL_APP}/cofrinhos`);
await page.getByText('Reserva de emergência').first().waitFor();
confere('Cofrinhos mostra a "Reserva de emergência"', true);
await page.goto(`${URL_APP}/contas`);
await page.getByTestId('repeticao').first().waitFor();
confere('Contas que se repetem: 5 (salário, aluguel, água, luz, internet)', (await page.getByTestId('repeticao').count()) === 5);
await page.goto(`${URL_APP}/desejos`);
await page.getByText('Notebook para estudar').first().waitFor();
confere('Desejos mostra o "Notebook para estudar"', true);

// 3. Um lançamento da pessoa sobrevive a "apagar só os exemplos"
await page.goto(`${URL_APP}/lancar`);
await page.getByRole('button', { name: 'Saúde', exact: true }).click();
await page.getByLabel('Valor', { exact: true }).fill('45,00');
await page.getByLabel(/Descrição/).fill('Dentista meu');
await page.locator('form button[type=submit]').click();
await aviso().waitFor();
await page.goto(`${URL_APP}/configuracoes`);
await page.getByRole('button', { name: 'Apagar só os dados de exemplo' }).click();
await aviso().filter({ hasText: 'Dados de exemplo apagados' }).waitFor();
let restam = await contar();
confere('Apagar exemplos deixa só o lançamento da pessoa', restam.length === 1 && restam[0].descricao === 'Dentista meu', restam.map((l) => l.descricao).join(', '));
await page.getByRole('button', { name: 'Carregar dados de exemplo' }).waitFor();
confere('O botão volta a oferecer "Carregar dados de exemplo"', true);

// 4. Apagar tudo pede confirmação digitada
await page.getByRole('button', { name: 'Apagar tudo' }).click();
const confirmar = page.getByRole('form', { name: 'Confirmar apagar tudo' }).getByRole('button', { name: 'Apagar tudo' });
confere('"Apagar tudo" fica bloqueado até digitar APAGAR', await confirmar.isDisabled());
await verificarTela(page, 'Configurações · apagar tudo · celular');
await page.locator('#confirma-apagar').fill('apagar');
await confirmar.click();
await aviso().filter({ hasText: 'Tudo apagado' }).waitFor();
restam = await contar();
confere('Depois de "Apagar tudo" não sobra nenhum lançamento', restam.length === 0);
await page.goto(URL_APP);
await page.getByRole('button', { name: 'Ver com dados de exemplo' }).waitFor();
confere('App volta ao começo (oferece os exemplos de novo)', true);

confere('Nenhum erro no console durante a auditoria de exemplos', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
