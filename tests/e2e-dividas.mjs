// Auditoria das Dívidas: cadastra empréstimos como uma pessoa faria, anexando um contrato em PDF
// de verdade (gerado aqui), confere o que o app leu, registra pagamentos e confere os cálculos de
// juros e de atraso. Uso: npm run build && npm run test:e2e
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, hoje, iniciarServidor, iso, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4176);
const PASTA = join(CAPTURAS, '..', 'arquivos-teste');
mkdirSync(PASTA, { recursive: true });

// ---------- PDFs de teste ----------
/** Monta um PDF simples (texto em Helvetica, acentos em Latin-1) com as linhas dadas. */
function gerarPdf(linhas) {
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const conteudo = linhas.length
    ? `BT /F1 10 Tf 50 800 Td 14 TL ${linhas.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`
    : '0.8 g 50 300 500 450 re f'; // "foto": só um retângulo cinza, sem texto
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const posicoes = [];
  objetos.forEach((o, i) => { posicoes.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
const CONTRATO = join(PASTA, 'contrato-consignado.pdf');
writeFileSync(CONTRATO, gerarPdf([
  'CÉDULA DE CRÉDITO BANCÁRIO - EMPRÉSTIMO CONSIGNADO',
  'CCB nº 123456789-0     Data de emissão: 10/03/2025',
  'CREDOR: Banco Horizonte S.A., CNPJ 00.000.000/0001-00',
  'QUADRO III - CARACTERÍSTICAS DA OPERAÇÃO',
  'Valor do empréstimo: R$ 10.000,00',
  'Quantidade de parcelas: 36',
  'Valor da parcela: R$ 385,43',
  'Vencimento da 1ª parcela: 10/04/2025',
  'Taxa de juros: 1,89% a.m.   Taxa de juros: 25,19% a.a.',
  'Custo Efetivo Total (CET): 2,05% a.m. e 27,58% a.a.',
  'Sistema de amortização: Tabela Price.',
  'CLÁUSULA 8 - DO INADIMPLEMENTO. No caso de atraso no pagamento de qualquer parcela,',
  'incidirão multa moratória de 2% (dois por cento) sobre o valor em atraso e juros de',
  'mora de 1% (um por cento) ao mês, calculados pro rata die.',
]));
const OUTRO_MODELO = join(PASTA, 'contrato-outro-modelo.pdf');
writeFileSync(OUTRO_MODELO, gerarPdf([
  'CONTRATO DE EMPRÉSTIMO CONSIGNADO EM FOLHA DE PAGAMENTO',
  'CREDOR: Paraná Banco S.A., CNPJ 14.388.334/0001-99, com sede em Curitiba/PR.',
  'Nº do contrato: 778899-1',
  'Valor liberado de R$ 5.000,00, a ser pago em 24 parcelas mensais de R$ 268,40.',
  'Juros remuneratórios de 1,80% ao mês. Multa de 2% e juros de mora de 1% ao mês.',
  'E por estarem de acordo, assinam. Curitiba, 5 de fevereiro de 2026.',
]));
const ESCANEADO = join(PASTA, 'contrato-escaneado.pdf');
writeFileSync(ESCANEADO, gerarPdf([]));

const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const aviso = () => page.getByTestId('aviso');
const valorDe = (id) => page.locator(`#campo-${id}`).inputValue();

// 1. Tela vazia explica o que dá para fazer
await page.goto(`${URL_APP}/dividas`);
await page.getByRole('heading', { name: 'Dívidas', exact: true }).waitFor();
confere('Dívidas: tela inicial explica que dá para anexar o contrato', await page.getByText(/Anexe o contrato em PDF/).isVisible());
await verificarTela(page, 'Dívidas vazia · celular');

// 2. Cadastro com o contrato em PDF
await page.getByRole('link', { name: 'Cadastrar o primeiro empréstimo' }).click();
await page.getByRole('heading', { name: 'Cadastrar empréstimo' }).waitFor();
confere('Formulário tem o botão "Anexar contrato (PDF)"', await page.getByText('Anexar contrato (PDF)').isVisible());
await page.locator('#campo-contrato').setInputFiles(CONTRATO);
await page.getByTestId('resultado-leitura').filter({ hasText: /encontrei/ }).waitFor({ timeout: 30000 });
const leitura = await page.getByTestId('resultado-leitura').innerText();
confere('Leitor: encontrou os 13 termos do contrato', leitura.includes('encontrei 13 termos'), leitura);
confere('Leitor: valor emprestado R$ 10.000,00', (await valorDe('valorEmprestado')) === '10.000,00');
confere('Leitor: 36 parcelas de R$ 385,43', (await valorDe('numeroParcelas')) === '36' && (await valorDe('valorParcela')) === '385,43');
confere('Leitor: taxa de juros 1,89% ao mês', (await valorDe('taxaJuros')) === '1,89' && (await valorDe('periodoTaxa')) === 'mes');
confere('Leitor: CET 27,58% ao ano', (await valorDe('cetAnual')) === '27,58');
confere('Leitor: multa 2% e juros de mora 1% ao mês', (await valorDe('multaAtraso')) === '2' && (await valorDe('jurosMora')) === '1' && (await valorDe('periodoMora')) === 'mes');
confere('Leitor: banco e número do contrato', (await valorDe('instituicao')) === 'Banco Horizonte S.A.' && (await valorDe('numeroContrato')) === '123456789-0');
confere('Leitor: 1ª parcela 10/04/2025 e contratação 10/03/2025', (await page.locator('#campo-dataPrimeiraParcela').inputValue()) === '10/04/2025' && (await valorDe('dataContratacao')) === '10/03/2025');
confere('Leitor: tipo "Consignado"', (await valorDe('tipo')) === 'consignado');
const selos = await page.getByText('lido do contrato · ver trecho').count();
confere('Cada um dos 13 valores lidos tem o selo "lido do contrato"', selos === 13, `${selos} selos`);
await page.getByText('lido do contrato · ver trecho').nth(selos > 6 ? 6 : 0).click();
confere('Selo mostra o trecho do contrato de onde saiu o valor', await page.locator('details[open] q').first().isVisible());
const conferencia = nb(await page.getByTestId('conferencia-taxa').innerText());
confere('Conferência da taxa: parcelas batem com 1,89% ao mês', conferencia.includes('1,89% ao mês') && conferencia.includes('Bate com a taxa do contrato'), conferencia);
const larguraTaxa = await page.locator('#campo-taxaJuros').evaluate((el) => el.getBoundingClientRect().width);
const larguraMora = await page.locator('#campo-jurosMora').evaluate((el) => el.getBoundingClientRect().width);
confere('Campos de taxa e de mora têm largura para ler o número (≥ 120px)', larguraTaxa >= 120 && larguraMora >= 120, `${Math.round(larguraTaxa)}px / ${Math.round(larguraMora)}px`);
await page.screenshot({ path: join(CAPTURAS, 'divida-form-lido.png'), fullPage: true });
await verificarTela(page, 'Cadastro de dívida · celular');

// Conferência automática: a lista vem preenchida pela análise do app
const itemDaLista = async (rotulo) => {
  const li = page.getByTestId('lista-conferencia').locator('li').filter({ hasText: rotulo }).first();
  return { situacao: await li.getAttribute('data-situacao'), texto: nb(await li.innerText()) };
};
confere('Conferência automática: "tudo confere"', (await page.getByTestId('resumo-conferencia').innerText()).includes('tudo confere'));
let item = await itemDaLista('Valor do empréstimo');
confere('Lista: Valor do empréstimo ✓ R$ 10.000,00', item.situacao === 'ok' && item.texto.includes('R$ 10.000,00'), item.texto);
item = await itemDaLista('Valor da parcela');
confere('Lista: Valor da parcela ✓ R$ 385,43', item.situacao === 'ok' && item.texto.includes('R$ 385,43'), item.texto);
item = await itemDaLista('Número de parcelas');
confere('Lista: Número de parcelas ✓ 36', item.situacao === 'ok' && item.texto.includes('36'));
item = await itemDaLista('Taxa de juros');
confere('Lista: Taxa de juros ✓ 1,89% ao mês', item.situacao === 'ok' && item.texto.includes('1,89% ao mês'));
item = await itemDaLista('Multa por atraso');
confere('Lista: Multa ✓ 2% dentro do limite do CDC', item.situacao === 'ok' && item.texto.includes('dentro do limite'));
confere('Lista: os 11 itens conferem (inclui a data da contratação)', (await page.getByTestId('lista-conferencia').locator('li[data-situacao="ok"]').count()) === 11);
item = await itemDaLista('Data da contratação');
confere('Lista: Data da contratação ✓ 10/03/2025', item.situacao === 'ok' && item.texto.includes('10/03/2025'));
confere('Caixa "Conferido" vem marcada automaticamente', await page.locator('#campo-conferido').isChecked() && await page.getByText('Conferido automaticamente pela análise do app.').isVisible());
// Se a parcela não bater com a taxa, o app aponta e desmarca sozinho
await page.locator('#campo-valorParcela').fill('400,00');
item = await itemDaLista('Parcela confere com a taxa');
confere('Parcela diferente da taxa: item ⚠ explicando seguro/tarifa', item.situacao === 'atencao' && item.texto.includes('seguro ou tarifa'), item.texto);
item = await itemDaLista('Valor da parcela');
confere('Valor alterado à mão: item ⚠ mostra o valor que está no contrato (R$ 385,43)', item.situacao === 'atencao' && item.texto.includes('no contrato está R$ 385,43'), item.texto);
confere('…e a caixa "Conferido" é desmarcada sozinha', !(await page.locator('#campo-conferido').isChecked()) && (await page.getByTestId('resumo-conferencia').innerText()).includes('para você conferir'));
await page.screenshot({ path: join(CAPTURAS, 'divida-conferencia-atencao.png'), fullPage: true });
await page.locator('#campo-valorParcela').fill('385,43');
confere('Corrigindo a parcela, volta a marcar sozinho', await page.locator('#campo-conferido').isChecked() && (await itemDaLista('Valor da parcela')).situacao === 'ok');

// Validações
await page.getByRole('button', { name: 'Salvar empréstimo' }).click();
confere('Exige um nome para o empréstimo', await page.getByText(/Dê um nome/).isVisible());
await page.locator('#campo-nome').fill('Consignado do carro');
// Consignado: desconto no salário. Salário todo dia 10 → o app conta os salários recebidos desde abr/2025
confere('Consignado: "descontado do salário" vem marcado', await page.locator('#campo-descontoEmFolha').isChecked());
await page.locator('#campo-salario-tipo').selectOption('dia');
await page.locator('#campo-salario-dia').selectOption('10');
const pagamentoSalario = (ano, mes) => { const d = new Date(ano, mes, 10); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); return d; };
const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
let jaVencidas = 0;
for (let k = 0; k < 36; k++) if (pagamentoSalario(2025, 3 + k) <= hojeSemHora) jaVencidas = k + 1;
const calculadas = nb(await page.getByTestId('parcelas-calculadas').innerText());
confere(`Consignado: app calcula ${jaVencidas} parcelas já descontadas pelos salários recebidos`, calculadas.startsWith(`${jaVencidas} parcelas já descontadas`) && calculadas.includes('todo dia 10') && calculadas.includes('desde a contratação em 10/03/2025'), calculadas);
await page.screenshot({ path: join(CAPTURAS, 'divida-consignado-salario.png'), fullPage: true });
await page.getByRole('button', { name: 'Salvar empréstimo' }).click();
await page.getByRole('heading', { name: 'Consignado do carro' }).waitFor();
confere('Salvou e abriu a página do contrato', nb(await aviso().innerText()).includes('“Consignado do carro” cadastrado.'));

// 3. Página do contrato: juros que está pagando
confere('Mostra nome personalizado + número do contrato', (await page.getByText('Banco Horizonte S.A. · Contrato nº 123456789-0').count()) === 1);
const juros = nb(await page.getByTestId('tabela-juros').innerText());
confere('Juros: parcela sem juros R$ 277,78 → com juros R$ 385,43', juros.includes('R$ 277,78 → R$ 385,43'), juros.replace(/\n/g, ' · '));
confere('Juros: R$ 3.875,48 no contrato todo (38,8% a mais)', juros.includes('R$ 3.875,48') && juros.includes('38,8% a mais'));
confere('Juros: 1,89% ao mês = 0,062% ao dia = 25,19% ao ano (do contrato)', juros.includes('1,89% ao mês') && juros.includes('0,062% ao dia') && juros.includes('25,19% ao ano') && juros.includes('(do contrato)'));
confere('Juros: CET 27,58% ao ano', juros.includes('27,58% ao ano'));
confere(`Situação: ${jaVencidas} de 36 pagas`, (await page.getByText(`${jaVencidas} de 36`, { exact: true }).count()) === 1);
confere('Mensagem: descontado direto do salário, com o próximo desconto', (await page.getByTestId('mensagem-parabens').innerText()).includes('Descontado direto do salário'));
confere('Consignado não pede para registrar pagamento (é automático)', await page.getByTestId('info-desconto-folha').isVisible() && (await page.getByRole('button', { name: /Registrar pagamento/ }).count()) === 0);
confere('Contrato guardado pode ser aberto', await page.getByRole('link', { name: 'Abrir contrato' }).isVisible());
confere('Página do contrato mostra "Conferido automaticamente pela análise do app" e a lista', (await page.getByTestId('situacao-conferencia').innerText()).includes('Conferido automaticamente pela análise do app') && await page.getByTestId('lista-conferencia').isVisible());
await page.getByText('Ver de onde vieram os termos').click();
confere('Mostra de onde vieram os termos (trechos do contrato)', await page.getByText(/juros de mora de 1%/i).first().isVisible());
await page.screenshot({ path: join(CAPTURAS, 'divida-detalhe.png'), fullPage: true });
await verificarTela(page, 'Detalhe da dívida · celular');

// 4. O dia do salário ficou salvo em Configurações
await page.goto(`${URL_APP}/configuracoes`);
await page.getByTestId('config-salario-exemplo').filter({ hasText: 'todo dia 10' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Configurações mostram o dia do salário cadastrado', (await page.getByTestId('config-salario-exemplo').innerText()).includes('todo dia 10'));
await page.goBack();
await page.getByRole('heading', { name: 'Consignado do carro' }).waitFor();

// 5. Segundo empréstimo, à mão, com parcela atrasada há 10 dias e sem taxa (app calcula)
const dias = 10;
const vencAtrasada = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias);
const primeira = new Date(vencAtrasada.getFullYear(), vencAtrasada.getMonth() - 4, vencAtrasada.getDate());
await page.goto(`${URL_APP}/dividas/novo`);
await page.locator('#campo-nome').fill('Empréstimo da reforma');
await page.locator('#campo-instituicao').fill('Banco Horizonte');
await page.locator('#campo-numeroContrato').fill('0098-7654');
await page.locator('#campo-valorEmprestado').fill('1.000,00');
await page.locator('#campo-numeroParcelas').fill('10');
await page.locator('#campo-valorParcela').fill('105,58');
await page.locator('#campo-dataPrimeiraParcela').fill(iso(primeira));
confere('Sem taxa informada, o app calcula pelas parcelas (1,00% ao mês)', nb(await page.getByTestId('conferencia-taxa').innerText()).includes('1,00% ao mês'));
confere('Outros empréstimos: app calcula as parcelas já vencidas (5)', (await page.locator('#campo-parcelasJaPagas').inputValue()) === '5');
await page.locator('#campo-parcelasJaPagas').fill('4');
await page.getByRole('button', { name: 'Salvar empréstimo' }).click();
await page.getByRole('heading', { name: 'Empréstimo da reforma' }).waitFor();
const esperado = 105_58 + 2_11 + Math.round((105_58 * 0.01 / 30) * dias);
const fmt = (c) => `R$ ${Math.floor(c / 100).toLocaleString('pt-BR')},${String(c % 100).padStart(2, '0')}`;
const atraso = nb(await page.getByTestId('atraso-5').innerText());
confere(`Atraso: parcela 5 há ${dias} dias = ${fmt(esperado)} (parcela + multa 2% + mora 1% ao mês por dia)`, atraso.includes(fmt(esperado)) && atraso.includes('R$ 2,11'), atraso.replace(/\n/g, ' · '));
confere('Alerta de atraso com o custo de cada dia', await page.getByTestId('mensagem-atraso').isVisible() && (await page.getByText(/Se continuar atrasando/).isVisible()));
confere('Juros calculados pelas parcelas quando o contrato não informa', nb(await page.getByTestId('tabela-juros').innerText()).includes('(calculada pelas parcelas)'));
confere('Valor sugerido do pagamento já inclui multa e juros', (await page.locator('#campo-valor-pago').inputValue()) === fmt(esperado).replace('R$ ', ''));
await page.screenshot({ path: join(CAPTURAS, 'divida-atrasada.png'), fullPage: true });
await verificarTela(page, 'Dívida atrasada · celular');

// Registrar pagamento da parcela atrasada, conferir em Lançamentos e desfazer
await page.getByRole('button', { name: 'Registrar pagamento da parcela 5' }).click();
await aviso().filter({ hasText: 'Parcela 5' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Pagamento com atraso é registrado', nb(await aviso().innerText()).includes('Parcela 5 registrada'));
await aviso().getByRole('button', { name: 'Desfazer' }).click();
await page.getByTestId('atraso-5').waitFor();
confere('"Desfazer" o pagamento volta a parcela para atrasada', true);
// Pagar a parcela 6 antes do vencimento: parabéns
await page.locator('#campo-parcela').selectOption('6');
await page.getByRole('button', { name: 'Registrar pagamento da parcela 6' }).click();
await aviso().filter({ hasText: 'Parcela 6' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Pagamento em dia recebe parabéns', nb(await aviso().innerText()).includes('Parcela 6 paga em dia. Parabéns!'));
await page.goto(`${URL_APP}/lancamentos`);
const lista = nb(await page.getByTestId('lista-lancamentos').innerText());
confere('Pagamento vira despesa em Lançamentos (Dívidas › Parcela de empréstimo)', lista.includes('Empréstimo da reforma — parcela 6 de 10') && lista.includes('Dívidas › Parcela de empréstimo'));
await page.goBack();
await page.getByRole('heading', { name: 'Empréstimo da reforma' }).waitFor();

// 5b. Contrato escrito de outro jeito: CREDOR:, Nº do contrato:, data por extenso e sem a 1ª parcela
await page.goto(`${URL_APP}/dividas/novo`);
await page.locator('#campo-contrato').setInputFiles(OUTRO_MODELO);
await page.getByTestId('resultado-leitura').filter({ hasText: /encontrei/ }).waitFor({ timeout: 30000 });
confere('Outro modelo: banco lido pelo rótulo "CREDOR:"', (await valorDe('instituicao')) === 'Paraná Banco S.A.');
confere('Outro modelo: número lido de "Nº do contrato:"', (await valorDe('numeroContrato')) === '778899-1');
confere('Outro modelo: data da contratação por extenso (5 de fevereiro de 2026)', (await valorDe('dataContratacao')) === '05/02/2026');
confere('Outro modelo: sem 1ª parcela no contrato, o app estima pela contratação e avisa', (await page.locator('#campo-dataPrimeiraParcela').inputValue()) !== '' && await page.getByText(/Estimada pela data da contratação/).isVisible());
await page.screenshot({ path: join(CAPTURAS, 'divida-outro-modelo.png'), fullPage: true });

// 6. Lista: atrasada aparece primeiro, com resumo
await page.locator('nav.fixed').getByRole('link', { name: 'Dívidas' }).click();
await page.getByLabel('Resumo das dívidas').waitFor();
const primeiroCartao = nb(await page.locator('main li').first().innerText());
confere('Lista: contrato atrasado aparece primeiro e marcado', primeiroCartao.startsWith('Empréstimo da reforma') && primeiroCartao.includes('Atrasado'));
confere('Lista: mostra "contrato anexado" no consignado', (await page.getByText('contrato anexado').count()) === 1);
await page.screenshot({ path: join(CAPTURAS, 'dividas-lista.png'), fullPage: true });
await verificarTela(page, 'Lista de dívidas · celular');

// 7. Editar e anexar contrato escaneado (sem texto)
await page.getByRole('link', { name: /Empréstimo da reforma/ }).click();
await page.getByRole('link', { name: 'Editar' }).click();
await page.locator('#campo-contrato').setInputFiles(ESCANEADO);
await page.getByTestId('resultado-leitura').filter({ hasText: /foto|digitaliza/ }).waitFor({ timeout: 30000 });
confere('PDF escaneado (foto): avisa para preencher à mão e guarda o arquivo', true);
await page.locator('#campo-conferido').check();
await page.getByRole('button', { name: 'Salvar alterações' }).click();
await page.getByRole('heading', { name: 'Empréstimo da reforma' }).waitFor();
confere('Contrato escaneado ficou guardado', await page.getByRole('link', { name: 'Abrir contrato' }).isVisible());

// 8. Persistência
await page.reload();
await page.getByRole('heading', { name: 'Empréstimo da reforma' }).waitFor();
confere('Depois de recarregar, tudo continua', await page.getByTestId('atraso-5').isVisible());

// 9. Excluir com confirmação
await page.getByRole('button', { name: 'Excluir empréstimo' }).click();
await page.getByRole('button', { name: 'Excluir', exact: true }).click();
await page.getByLabel('Resumo das dívidas').waitFor();
confere('Excluir pede confirmação e remove da lista', (await page.locator('main li').count()) === 1);

// 10. Notebook
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/dividas/novo`);
await p2.getByRole('heading', { name: 'Cadastrar empréstimo' }).waitFor();
await verificarTela(p2, 'Cadastro de dívida · notebook');
await p2.screenshot({ path: join(CAPTURAS, 'divida-form-notebook.png'), fullPage: true });
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de dívidas', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
