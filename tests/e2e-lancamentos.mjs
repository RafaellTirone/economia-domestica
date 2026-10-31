// Auditoria da alimentação de dados: um "robô" usa o app como uma pessoa, tocando nos botões,
// e confere cada caminho de cadastro — despesa, receita, parcelado, sugestão, edição, exclusão,
// desfazer, filtros, validações, teclado e persistência.
// Uso: npm run build && npm run test:e2e
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, hoje, iniciarServidor, iso, MESES, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4175);
const navegador = await playwright.chromium.launch();
const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// ---------- ações reutilizáveis ----------
const salvar = (page) => page.locator('form button[type=submit]').click();
const aviso = (page) => page.getByTestId('aviso');
const renda = async (page) => nb(await page.locator('section[aria-labelledby="titulo-renda"]').innerText());

/** Preenche e salva um lançamento pela tela, como uma pessoa faria. */
async function lancar(page, { tipo = 'Gastei', categoria, sub, valor, descricao, forma, parcelas, fixa, data, salvarComo = 'normal' }) {
  if (!page.url().includes('/lancar')) await page.getByRole('link', { name: /Novo lançamento|Lançar/ }).first().click();
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  if (tipo === 'Recebi') await page.getByRole('radio', { name: 'Recebi' }).click();
  if (descricao) await page.getByLabel(/Descrição/).fill(descricao);
  if (categoria) await page.getByRole('button', { name: categoria, exact: true }).click();
  if (sub) await page.getByRole('button', { name: sub, exact: true }).click();
  if (valor !== undefined) await page.getByLabel('Valor', { exact: true }).fill(valor);
  if (forma) await page.getByRole('button', { name: forma, exact: true }).click();
  if (parcelas) await page.getByLabel('Parcelas no cartão').selectOption(String(parcelas));
  if (fixa) await page.getByLabel(/Despesa fixa/).check();
  if (data === 'ontem') await page.getByRole('button', { name: 'Ontem', exact: true }).click();
  else if (data) await page.locator('#campo-data').fill(data);
  if (salvarComo === 'outro') await page.getByRole('button', { name: 'Salvar e lançar outro' }).click();
  else await salvar(page);
}

// =====================================================================
// CELULAR — fluxo completo de quem está começando
// =====================================================================
{
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();

  // 1. Botão "+" abre o formulário de verdade (era a falha relatada)
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  confere('Botão "+" abre o formulário de lançamento', await page.getByLabel('Valor', { exact: true }).isVisible());
  confere('Na tela de lançar, o menu some e os botões de salvar ficam fixos embaixo',
    !(await page.locator('nav.fixed').isVisible()) && await page.locator('form button[type=submit]').isVisible());
  await page.screenshot({ path: join(CAPTURAS, 'lancar-celular-vazio.png') });
  await verificarTela(page, 'Lançar · celular');

  // 2. Validação: salvar vazio mostra o que falta
  await salvar(page);
  confere('Salvar vazio avisa "Escolha uma categoria"', await page.getByText('Escolha uma categoria.').isVisible());
  confere('Salvar vazio avisa "Digite um valor maior que zero"', await page.getByText('Digite um valor maior que zero.').isVisible());
  confere('Foco vai para o primeiro campo com problema', await page.evaluate(() => document.activeElement?.id === 'campo-categoriaId'));
  await page.getByLabel('Valor', { exact: true }).fill('1,2,3');
  await page.getByRole('button', { name: 'Moradia', exact: true }).click();
  await salvar(page);
  confere('Valor digitado errado ("1,2,3") é recusado com explicação', await page.getByText(/Valor inválido/).isVisible());
  await page.getByLabel('Valor', { exact: true }).fill('abc72');
  confere('Letras não entram no campo de valor', (await page.getByLabel('Valor', { exact: true }).inputValue()) === '72');
  await page.getByRole('button', { name: 'Voltar' }).click();

  // 3. Primeira despesa: Alimentação › Delivery, R$ 72,50 no crédito
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByRole('button', { name: 'Alimentação', exact: true }).click();
  confere('Ao escolher a categoria aparecem as subcategorias', await page.getByRole('button', { name: 'Delivery', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Delivery', exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill('72,5');
  await page.getByLabel(/Descrição/).click();
  confere('Valor é arrumado ao sair do campo (72,5 → 72,50)', (await page.getByLabel('Valor', { exact: true }).inputValue()) === '72,50');
  confere('Botão mostra o valor que será salvo', nb(await page.locator('form button[type=submit]').innerText()) === 'Salvar R$ 72,50');
  await page.getByLabel(/Descrição/).fill('Delivery');
  await page.getByRole('button', { name: 'Crédito', exact: true }).click();
  await page.screenshot({ path: join(CAPTURAS, 'lancar-celular-preenchido.png'), fullPage: true });
  await salvar(page);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  confere('Depois de salvar, volta para a Visão geral', new URL(page.url()).pathname === '/');
  confere('Aviso confirma "Despesa de R$ 72,50 salva."', nb(await aviso(page).innerText()).includes('Despesa de R$ 72,50 salva.'));
  const envAlim = nb(await page.getByRole('link', { name: /^Alimentação:/ }).innerText());
  confere('Envelope Alimentação mostra R$ 72,50', envAlim.includes('R$ 72,50'), envAlim.replace(/\n/g, ' · '));
  confere('Aparece em "Últimos lançamentos"', (await page.locator('section[aria-labelledby="titulo-ultimos"]').innerText()).includes('Delivery'));

  // 4. Receita + "Salvar e lançar outro" + despesa fixa
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByRole('radio', { name: 'Recebi' }).click();
  confere('Receita mostra só formas válidas (sem "Crédito")', !(await page.getByRole('button', { name: 'Crédito', exact: true }).isVisible()));
  await lancar(page, { categoria: 'Salário', valor: '6.500', forma: 'Pix', salvarComo: 'outro' });
  await aviso(page).waitFor();
  await page.waitForFunction(() => document.getElementById('campo-valor')?.value === '');
  confere('"Salvar e lançar outro" mantém a tela aberta e limpa o valor',
    page.url().includes('/lancar') && (await page.getByLabel('Valor', { exact: true }).inputValue()) === '');
  confere('Aviso confirma "Receita de R$ 6.500,00 salva."', nb(await aviso(page).innerText()).includes('Receita de R$ 6.500,00 salva.'));
  await page.getByRole('radio', { name: 'Gastei' }).click();
  confere('Formulário de despesa oferece "Crédito" de novo', await page.getByRole('button', { name: 'Crédito', exact: true }).isVisible());
  await lancar(page, { categoria: 'Moradia', sub: 'Aluguel / financiamento', valor: '1650', descricao: 'Aluguel', forma: 'Pix', fixa: true });
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  let r = await renda(page);
  confere('Visão geral: Entraram R$ 6.500,00', r.includes('R$ 6.500,00'), r.replace(/\n/g, ' · '));
  confere('Visão geral: Despesas R$ 1.722,50', r.includes('R$ 1.722,50'));
  confere('Visão geral: Saldo R$ 4.777,50', r.includes('R$ 4.777,50'));

  // 5. Sugestão inteligente pela descrição
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByLabel(/Descrição/).fill('delivery');
  confere('Descrição já usada sugere a categoria (Alimentação)', (await page.getByRole('button', { name: 'Alimentação', exact: true }).getAttribute('aria-pressed')) === 'true');
  confere('…e a subcategoria e a forma de pagamento',
    (await page.getByRole('button', { name: 'Delivery', exact: true }).getAttribute('aria-pressed')) === 'true'
    && (await page.getByRole('button', { name: 'Crédito', exact: true }).getAttribute('aria-pressed')) === 'true');
  confere('Mostra que a categoria foi sugerida', await page.getByText(/Categoria sugerida/).isVisible());
  await page.getByLabel('Valor', { exact: true }).fill('30');
  await salvar(page);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();

  // 6. Compra parcelada no cartão: cada parcela no mês dela
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByRole('button', { name: 'Vestuário', exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill('100,00');
  confere('Opção de parcelas só aparece no crédito', !(await page.getByLabel('Parcelas no cartão').isVisible()));
  await page.getByRole('button', { name: 'Crédito', exact: true }).click();
  await page.getByLabel('Parcelas no cartão').selectOption('3');
  const dica = nb(await page.getByText(/3x de/).innerText());
  confere('Mostra as parcelas sem perder centavos (3x de R$ 33,33, 1ª de R$ 33,34)', dica.includes('3x de R$ 33,33') && dica.includes('1ª de R$ 33,34'), dica);
  await page.getByLabel(/Descrição/).fill('Tênis');
  await salvar(page);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  confere('Aviso confirma "salva em 3x"', nb(await aviso(page).innerText()).includes('R$ 100,00 salva em 3x'));
  r = await renda(page);
  confere('Neste mês entra só a 1ª parcela (despesas R$ 1.785,84)', r.includes('R$ 1.785,84'), r.replace(/\n/g, ' · '));

  // 7. Lista de lançamentos
  await page.getByRole('button', { name: 'Mais' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Lançamentos' }).click();
  await page.getByTestId('lista-lancamentos').waitFor();
  let lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Lista mostra os 5 lançamentos do mês', lista.includes('5 lançamentos'), lista.split('\n')[0]);
  confere('Lista mostra "parcela 1 de 3"', lista.includes('parcela 1 de 3'));
  confere('Lista marca a despesa fixa', lista.includes('fixa'));
  const totaisLista = nb(await page.getByLabel('Totais do período').innerText());
  confere('Totais da lista batem com a Visão geral', totaisLista.includes('R$ 6.500,00') && totaisLista.includes('R$ 1.785,84') && totaisLista.includes('R$ 4.714,16'), totaisLista.replace(/\n/g, ' · '));
  await page.screenshot({ path: join(CAPTURAS, 'lancamentos-celular.png'), fullPage: true });
  await verificarTela(page, 'Lançamentos · celular');
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Mês seguinte tem a parcela 2 de 3 (R$ 33,33)', lista.includes('parcela 2 de 3') && lista.includes('R$ 33,33'));
  confere('Parcela futura aparece como "a pagar"', lista.includes('a pagar'));
  await page.getByRole('button', { name: 'Mês anterior' }).click();

  // 8. Filtros e busca
  await page.getByRole('radio', { name: 'Receitas' }).click();
await page.getByTestId('lista-lancamentos').filter({ hasText: '1 lançamento' }).waitFor({ timeout: 5000 }).catch(() => {});
  lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Filtro "Receitas" mostra só o salário', lista.includes('1 lançamento') && lista.includes('Salário'));
  await page.getByRole('radio', { name: 'Todos' }).click();
  await page.getByLabel('Buscar').fill('alúg');
  lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Busca ignora acento ("alúg" acha "Aluguel")', lista.includes('1 lançamento') && lista.includes('Aluguel'));
  await page.getByLabel('Buscar').fill('xyz-nada');
  confere('Busca sem resultado mostra mensagem clara', await page.getByText('Nenhum lançamento encontrado com esses filtros.').isVisible());
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
await page.getByTestId('lista-lancamentos').filter({ hasText: '2 lançamentos' }).waitFor({ timeout: 5000 }).catch(() => {});
  lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Filtro por categoria (Alimentação = 2 lançamentos)', lista.includes('2 lançamentos'));
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByLabel('Escolher outro período').check();
  await page.locator('#filtro-inicio').fill(iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)));
  await page.locator('#filtro-fim').fill(iso(new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0)));
  lista = nb(await page.getByTestId('lista-lancamentos').innerText());
  confere('Período personalizado (próximos 2 meses) mostra as parcelas 2 e 3', lista.includes('2 lançamentos') && lista.includes('parcela 3 de 3'), lista.split('\n')[0]);
  confere('Datas do período aparecem em dd/mm/aaaa', /^\d{2}\/\d{2}\/\d{4}$/.test(await page.locator('#filtro-inicio').inputValue()));
  await page.getByLabel('Escolher outro período').uncheck();

  // 9. Editar
  await page.getByRole('link', { name: /Aluguel/ }).click();
  await page.getByRole('heading', { name: 'Editar lançamento' }).waitFor();
  confere('Edição abre com os dados salvos', (await page.getByLabel('Valor', { exact: true }).inputValue()) === '1.650,00'
    && (await page.getByLabel(/Despesa fixa/).isChecked()));
  await page.getByLabel('Valor', { exact: true }).fill('1.700,00');
  await salvar(page);
  await page.getByTestId('lista-lancamentos').waitFor();
  confere('Alteração salva e volta para a lista', nb(await aviso(page).innerText()).includes('Alterações salvas.')
    && nb(await page.getByTestId('lista-lancamentos').innerText()).includes('R$ 1.700,00'));

  // 10. Excluir e desfazer
  await page.getByRole('link', { name: /Tênis/ }).click();
  await page.getByRole('heading', { name: 'Editar lançamento' }).waitFor();
  confere('Editar parcela avisa que muda só esta parcela', await page.getByText(/Parcela 1 de 3/).isVisible());
  await page.getByRole('button', { name: 'Excluir lançamento' }).click();
  await page.getByTestId('lista-lancamentos').waitFor();
  confere('Excluir tira da lista e oferece "Desfazer"', !(nb(await page.getByTestId('lista-lancamentos').innerText()).includes('Tênis'))
    && await aviso(page).getByRole('button', { name: 'Desfazer' }).isVisible());
  await aviso(page).getByRole('button', { name: 'Desfazer' }).click();
  await page.getByRole('link', { name: /Tênis/ }).waitFor();
  confere('"Desfazer" traz o lançamento de volta', nb(await page.getByTestId('lista-lancamentos').innerText()).includes('Tênis'));

  // 11. Desfazer logo depois de criar (saindo da Visão geral, o app volta para ela)
  await page.locator('nav.fixed').getByRole('link', { name: 'Visão' }).click();
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await lancar(page, { categoria: 'Alimentação', sub: 'Padaria', valor: '18,50', descricao: 'Padaria', forma: 'Débito', data: 'ontem' });
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  const antes = await renda(page);
  await aviso(page).getByRole('button', { name: 'Desfazer' }).click();
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="titulo-renda"]')?.textContent.includes('1.835,84'), null, { timeout: 5000 }).catch(() => {});
  confere('"Desfazer" logo após salvar cancela o lançamento', antes.includes('R$ 1.854,34') && (await renda(page)).includes('R$ 1.835,84'));

  // 12. Data de ontem e data futura
  await page.getByRole('link', { name: 'Novo lançamento' }).click();
  await page.getByRole('button', { name: 'Ontem', exact: true }).click();
  confere('Botão "Ontem" mostra a data em dd/mm/aaaa (mesmo com navegador em inglês)', (await page.locator('#campo-data').inputValue()) === ddmm(ontem));
  const futura = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 3));
  await page.locator('#campo-data').fill(futura);
  confere('Data futura desmarca "Já foi pago" sozinho', !(await page.getByLabel(/Já foi pago/).isChecked()) && await page.getByText(/data futura/).isVisible());
  await page.getByRole('button', { name: 'Voltar' }).click();

  // 13. Persistência: recarregar não perde nada
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  r = await renda(page);
  confere('Depois de recarregar, os totais continuam (despesas R$ 1.835,84)', r.includes('R$ 6.500,00') && r.includes('R$ 1.835,84'), r.replace(/\n/g, ' · '));
  await page.screenshot({ path: join(CAPTURAS, 'inicio-celular-alimentado.png'), fullPage: true });
  await verificarTela(page, 'Visão geral alimentada · celular');

  // 14. Envelope leva para a lista filtrada
  await page.getByRole('link', { name: /^Alimentação:/ }).click();
  await page.waitForURL('**/lancamentos?categoria=*', { timeout: 5000 }).catch(() => {});
  await page.getByLabel('Categoria').waitFor({ timeout: 5000 }).catch(() => {});
  confere('Tocar no envelope abre os lançamentos daquela categoria', page.url().includes('/lancamentos?categoria=')
    && (await page.getByLabel('Categoria').inputValue()) !== '');

  // 15. Endereço antigo
  await page.goto(`${URL_APP}/gastos`);
  await page.getByRole('heading', { name: 'Lançamentos' }).waitFor();
  confere('Endereço antigo /gastos leva para Lançamentos', new URL(page.url()).pathname === '/lancamentos');

  confere('Celular: nenhum erro no console durante a auditoria', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// =====================================================================
// NOTEBOOK — mouse e só teclado
// =====================================================================
{
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  await page.goto(URL_APP);
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  await page.locator('header').getByRole('link', { name: 'Lançar' }).click();
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  await page.screenshot({ path: join(CAPTURAS, 'lancar-notebook.png'), fullPage: true });
  await verificarTela(page, 'Lançar · notebook');

  // Só teclado: Tab até a categoria, Enter para escolher, digitar valor, Enter para salvar
  await page.getByRole('button', { name: 'Contas da casa', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Luz', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByLabel('Valor', { exact: true }).focus();
  await page.keyboard.type('186,40');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
  const env = nb(await page.getByRole('link', { name: /^Contas da casa:/ }).innerText());
  confere('Notebook: lançar só com o teclado funciona (Contas da casa › Luz R$ 186,40)', env.includes('R$ 186,40'), env.replace(/\n/g, ' · '));
  const ult = nb(await page.locator('section[aria-labelledby="titulo-ultimos"]').innerText());
  confere('Sem descrição, a lista usa o nome da subcategoria ("Luz")', ult.includes('Luz'));
  await page.locator('header').getByRole('link', { name: 'Lançamentos', exact: true }).click();
  await page.getByTestId('lista-lancamentos').waitFor();
  await page.screenshot({ path: join(CAPTURAS, 'lancamentos-notebook.png'), fullPage: true });
  await verificarTela(page, 'Lançamentos · notebook');
  confere('Notebook: nenhum erro no console', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await navegador.close();
encerrar();
