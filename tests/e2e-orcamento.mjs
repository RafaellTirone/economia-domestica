// Auditoria de Categorias (criar, editar, excluir movendo os lançamentos) e do Orçamento
// (limites por categoria e avisos em 80% e 100%).
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4188);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const aviso = () => page.getByTestId('aviso');

async function gastar(categoria, valor, descricao) {
  await page.goto(`${URL_APP}/lancar`);
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  await page.getByLabel(/Descrição/).fill(descricao);
  await page.getByRole('button', { name: categoria, exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill(valor);
  await page.locator('form button[type=submit]').click();
  await aviso().waitFor();
  return nb(await aviso().innerText());
}

await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();

// 1. Criar categoria nova com cor, ícone, subcategorias e limite
await page.goto(`${URL_APP}/configuracoes`);
await page.getByRole('link', { name: 'Criar, editar ou excluir categorias' }).click();
await page.getByRole('heading', { name: 'Categorias', exact: true }).waitFor();
confere('Configurações leva para a lista de categorias', page.url().endsWith('/categorias'));
await page.getByRole('link', { name: 'Nova categoria' }).click();
await page.getByRole('heading', { name: 'Nova categoria' }).waitFor();
await page.getByRole('button', { name: 'Criar categoria' }).click();
confere('Validação: pede o nome da categoria', await page.locator('#categoria-nome').getAttribute('aria-invalid') === 'true' || (await page.getByRole('alert').count()) > 0);
await page.locator('#categoria-nome').fill('Pet');
await page.getByRole('button', { name: /^Cor / }).nth(3).click();
await page.getByRole('button', { name: /^Ícone / }).nth(5).click();
await page.locator('#nova-sub').fill('Ração');
await page.getByRole('button', { name: 'Adicionar subcategoria' }).click();
await page.locator('#nova-sub').fill('Veterinário');
await page.locator('#nova-sub').press('Enter');
await page.locator('#categoria-limiteMensal').fill('100,00');
await verificarTela(page, 'Nova categoria · celular');
await page.getByRole('button', { name: 'Criar categoria' }).click();
await page.getByRole('link', { name: /^Pet / }).waitFor();
const linhaPet = nb(await page.getByRole('link', { name: /^Pet / }).innerText());
confere('Categoria "Pet" aparece com subcategorias e limite R$ 100,00', linhaPet.includes('Ração · Veterinário') && linhaPet.includes('limite R$ 100,00'), linhaPet);

// 2. Nome repetido não pode
await page.getByRole('link', { name: 'Nova categoria' }).click();
await page.locator('#categoria-nome').fill('pet');
await page.getByRole('button', { name: 'Criar categoria' }).click();
confere('Não deixa criar categoria com nome repetido', page.url().endsWith('/categorias/nova'));
await page.goto(`${URL_APP}/categorias`);

// 3. A categoria nova aparece no Lançar; avisos de 80% e 100%
let t = await gastar('Pet', '50,00', 'Ração');
confere('Gasto de 50% do limite: sem aviso de orçamento', !t.includes('Atenção'), t);
t = await gastar('Pet', '35,00', 'Vacina');
confere('Chegou a 85%: aviso "Pet chegou a 85% do limite do mês"', t.includes('Pet chegou a 85% do limite do mês'), t);
t = await gastar('Pet', '5,00', 'Petisco');
confere('Ainda abaixo de 100%: não repete o aviso', !t.includes('Atenção'), t);
t = await gastar('Pet', '20,00', 'Banho');
confere('Passou de 100%: aviso "Pet passou do limite do mês (110%)"', t.includes('Pet passou do limite do mês (110%)'), t);

// 4. Tela de Orçamento
await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
await page.getByRole('button', { name: /Mais/ }).click();
await page.getByRole('dialog').getByRole('link', { name: 'Orçamento' }).click();
await page.getByRole('heading', { name: 'Orçamento', exact: true }).waitFor();
const pet = nb(await page.getByTestId('orcamento-Pet').innerText());
confere('Orçamento mostra Pet: R$ 110,00 de R$ 100,00 · 110% · passou R$ 10,00', pet.includes('R$ 110,00 gastos de R$ 100,00') && pet.includes('110%') && pet.includes('passou R$ 10,00'), pet);
const idAlim = await page.getByTestId('orcamento-Alimentação').locator('input').getAttribute('id');
await page.locator(`#${idAlim}`).fill('1.200,00');
await page.locator(`#${idAlim}`).press('Enter');
await page.getByTestId('total-limites').filter({ hasText: 'R$ 1.300,00' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Definir limite de Alimentação pela tela de Orçamento soma R$ 1.300,00', nb(await page.getByTestId('total-limites').innerText()).includes('R$ 1.300,00'));
const alim = nb(await page.getByTestId('orcamento-Alimentação').innerText());
confere('Alimentação mostra "restam R$ 1.200,00"', alim.includes('restam R$ 1.200,00'), alim);
await verificarTela(page, 'Orçamento · celular');
await page.reload();
await page.getByTestId('total-limites').waitFor();
confere('Limite continua salvo depois de recarregar', nb(await page.getByTestId('total-limites').innerText()).includes('R$ 1.300,00'));

// 5. Editar: renomear e trocar uma subcategoria
await page.goto(`${URL_APP}/categorias`);
await page.getByRole('link', { name: /^Pet / }).click();
await page.getByRole('heading', { name: 'Editar categoria' }).waitFor();
await page.locator('#categoria-nome').fill('Pets');
await page.locator('#sub-1').fill('Clínica');
await page.getByRole('button', { name: 'Salvar alterações' }).click();
await page.getByRole('link', { name: /^Pets / }).waitFor();
confere('Editar renomeia e muda subcategoria', nb(await page.getByRole('link', { name: /^Pets / }).innerText()).includes('Ração · Clínica'));

// 6. Excluir movendo os lançamentos para "Outros"
await page.getByRole('link', { name: /^Pets / }).click();
await page.getByRole('button', { name: 'Excluir categoria' }).click();
await page.locator('#mover-para').selectOption({ label: 'Outros' });
await page.getByRole('button', { name: 'Excluir', exact: true }).click();
await page.getByRole('heading', { name: 'Categorias', exact: true }).waitFor();
confere('Categoria excluída some da lista', (await page.getByRole('link', { name: /^Pets / }).count()) === 0);
await page.goto(`${URL_APP}/orcamento`);
const outros = nb(await page.getByTestId('orcamento-Outros').innerText());
confere('Os 4 gastos (R$ 110,00) foram para "Outros"', outros.includes('R$ 110,00 gastos'), outros);

// 7. Notebook
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/orcamento`);
await p2.getByRole('heading', { name: 'Orçamento', exact: true }).waitFor();
await verificarTela(p2, 'Orçamento · notebook');
await p2.goto(`${URL_APP}/categorias`);
await p2.getByRole('heading', { name: 'Categorias', exact: true }).waitFor();
await verificarTela(p2, 'Categorias · notebook');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de orçamento', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
