// Auditoria da calculadora do lançamento: contas da compra e "Finalizar" mandando o resultado
// para a categoria/detalhe escolhidos (ex.: Alimentação › Açougue).
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4191);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const calc = () => page.getByTestId('calculadora');
const tocar = async (...teclas) => { for (const t of teclas) await calc().getByRole('button', { name: t, exact: true }).click(); };
const resultado = async () => nb(await page.getByTestId('calc-resultado').innerText());

await page.goto(`${URL_APP}/lancar`);
await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();

// 1. Entrou em Alimentação › Açougue e abriu a calculadora
await page.getByRole('button', { name: 'Alimentação', exact: true }).click();
await page.getByRole('button', { name: 'Açougue', exact: true }).click();
await page.getByRole('button', { name: 'Calculadora' }).click();
await calc().waitFor();
confere('Calculadora mostra para onde vai: "Alimentação › Açougue"', nb(await calc().innerText()).includes('Vai para: Alimentação › Açougue'));
confere('Finalizar fica desligado sem conta', await calc().getByRole('button', { name: 'Finalizar' }).isDisabled());

// 2. Várias contas: 1,250 kg × 42,90 = 53,63; + 18,90 de linguiça; = ; − 10% de desconto
await tocar('1', 'Vírgula', '2', '5', '0', 'Multiplicar', '4', '2', 'Vírgula', '9', '0');
confere('Resultado aparece enquanto digita (1,250 × 42,90 = R$ 53,63)', (await resultado()).includes('R$ 53,63'), await resultado());
await tocar('Mais', '1', '8', 'Vírgula', '9', '0', 'Igual');
confere('"=" fecha a conta: R$ 72,53 e guarda na fita', (await resultado()).includes('R$ 72,53') && nb(await calc().getByRole('list', { name: 'Contas feitas' }).innerText()).includes('= 72,53'));
await tocar('Menos', '1', '0', 'Porcentagem');
confere('Desconto de 10%: 72,53 − 10% = R$ 65,28', (await resultado()).includes('R$ 65,28'), await resultado());
await tocar('Apagar o último', 'Apagar o último', 'Apagar o último');
confere('Apagar volta para R$ 72,53', (await resultado()).includes('R$ 72,53'), await resultado());
await verificarTela(page, 'Calculadora · celular');

// 3. Finalizar manda o resultado para o Açougue
const finalizar = calc().getByRole('button', { name: /^Finalizar/ });
confere('Botão diz "Finalizar: R$ 72,53 em Açougue"', nb(await finalizar.innerText()) === 'Finalizar: R$ 72,53 em Açougue', nb(await finalizar.innerText()));
await finalizar.click();
await calc().waitFor({ state: 'detached' });
confere('Valor do lançamento recebeu 72,53', (await page.locator('#campo-valor').inputValue()) === '72,53');
confere('Açougue continua escolhido', (await page.getByRole('button', { name: 'Açougue', exact: true }).getAttribute('aria-pressed')) === 'true');
await page.locator('form button[type=submit]').click();
await page.getByTestId('aviso').waitFor();
confere('Salvou "Despesa de R$ 72,53"', nb(await page.getByTestId('aviso').innerText()).includes('Despesa de R$ 72,53 salva.'));
await page.goto(`${URL_APP}/lancamentos`);
const lista = nb(await page.getByTestId('lista-lancamentos').innerText());
confere('Na lista aparece em Alimentação › Açougue', lista.includes('R$ 72,53') && lista.includes('Açougue'), lista.split('\n').slice(0, 6).join(' · '));

// 4. Sem detalhe escolhido: dá para escolher dentro da calculadora; e continua do valor que já estava
await page.goto(`${URL_APP}/lancar`);
await page.getByRole('button', { name: 'Alimentação', exact: true }).click();
await page.getByLabel('Valor', { exact: true }).fill('10,00');
await page.getByRole('button', { name: 'Calculadora' }).click();
confere('Abre continuando do valor que já estava (10)', nb(await page.getByTestId('calc-expressao').innerText()) === '10,00' || nb(await page.getByTestId('calc-expressao').innerText()) === '10');
await calc().getByRole('button', { name: 'Padaria', exact: true }).click();
confere('Escolher "Padaria" dentro da calculadora muda o destino', nb(await calc().innerText()).includes('Vai para: Alimentação › Padaria'));
await tocar('Mais', '8', 'Vírgula', '5');
await calc().getByRole('button', { name: /^Finalizar/ }).click();
confere('Finalizar: 10 + 8,5 → 18,50 em Padaria', (await page.locator('#campo-valor').inputValue()) === '18,50'
  && (await page.getByRole('button', { name: 'Padaria', exact: true }).getAttribute('aria-pressed')) === 'true');

// 5. Dividir por zero não quebra; fechar não muda o valor
await page.getByRole('button', { name: 'Calculadora' }).click();
await tocar('Limpar tudo', '5', 'Dividir', '0');
confere('Dividir por zero não dá resultado nem deixa finalizar', (await resultado()) === '…' && await calc().getByRole('button', { name: 'Finalizar' }).isDisabled());
await calc().getByRole('button', { name: 'Fechar calculadora' }).click();
confere('Fechar sem finalizar mantém o valor (18,50)', (await page.locator('#campo-valor').inputValue()) === '18,50');

// 6. Notebook: dá para usar o teclado
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/lancar`);
await p2.getByRole('button', { name: 'Alimentação', exact: true }).click();
await p2.getByRole('button', { name: 'Feira / hortifrúti', exact: true }).click();
await p2.getByRole('button', { name: 'Calculadora' }).click();
await p2.keyboard.type('12,5+7,25*2');
await p2.keyboard.press('Enter');
confere('Teclado do computador: 12,5 + 7,25 × 2 = R$ 27,00', nb(await p2.getByTestId('calc-resultado').innerText()).includes('R$ 27,00'), nb(await p2.getByTestId('calc-resultado').innerText()));
await verificarTela(p2, 'Calculadora · notebook');
await p2.getByRole('button', { name: /^Finalizar/ }).click();
confere('Notebook: resultado vai para Feira (27,00)', (await p2.locator('#campo-valor').inputValue()) === '27,00');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria da calculadora', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
