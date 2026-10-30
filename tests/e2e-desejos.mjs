// Auditoria de Desejos e da estimativa de poupança.
// Uso: npm run build && npm run test:e2e
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, hoje, iniciarServidor, iso, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4178);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const fmt = (c) => `R$ ${Math.floor(c / 100).toLocaleString('pt-BR')},${String(Math.round(c) % 100).padStart(2, '0')}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Dados: 3 meses anteriores com renda de R$ 6.500,00 e gastos em Alimentação
await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
const gastos = [5390_00, 5150_00, 5212_40];
await page.evaluate(({ meses, gastos }) => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => {
    const tx = req.result.transaction(['lancamentos', 'emprestimos'], 'readwrite');
    const base = { forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' };
    meses.forEach((m, i) => {
      tx.objectStore('lancamentos').add({ ...base, tipo: 'receita', data: `${m}-05`, descricao: 'Salário', valor: 650000, categoriaId: 12 });
      tx.objectStore('lancamentos').add({ ...base, tipo: 'despesa', data: `${m}-10`, descricao: 'Mercado', valor: gastos[i], categoriaId: 2 });
    });
    tx.objectStore('emprestimos').add({
      nome: 'Empréstimo da reforma', instituicao: 'Banco Horizonte', numeroContrato: '0098-7654', tipo: 'pessoal', valorEmprestado: 100000, numeroParcelas: 10,
      valorParcela: 10558, taxaJuros: 1, periodoTaxa: 'mes', cetAnual: null, sistema: 'price', dataContratacao: null, dataPrimeiraParcela: meses[0] + '-25',
      multaAtraso: 2, jurosMora: 1, periodoMora: 'mes', trechos: {}, termosConferidos: false, contratoArquivoId: null, criadoEm: '',
    });
    tx.oncomplete = () => { req.result.close(); ok(); };
  };
}), { meses: [3, 2, 1].map((k) => iso(new Date(hoje.getFullYear(), hoje.getMonth() - k, 1)).slice(0, 7)), gastos });

// 1. Estimativa de poupança
await page.goto(`${URL_APP}/desejos`);
await page.getByTestId('media-mensal').waitFor();
const media = nb(await page.getByTestId('media-mensal').innerText());
confere('Média dos últimos 3 meses: ganha R$ 6.500,00, gasta R$ 5.250,80, sobra R$ 1.249,20', media.includes('R$ 6.500,00') && media.includes('R$ 5.250,80') && media.includes('R$ 1.249,20'), media.replace(/\n/g, ' · '));
const proj = nb(await page.getByTestId('tabela-projecao').innerText());
const rendendo12 = Math.round(124920 * ((1.008 ** 12 - 1) / 0.008));
confere('Projeção: 6 meses R$ 7.495,20 e 1 ano R$ 14.990,40 (parado)', proj.includes('R$ 7.495,20') && proj.includes('R$ 14.990,40'));
confere(`Projeção rendendo 0,8% ao mês: 1 ano ${fmt(rendendo12)}`, proj.includes(fmt(rendendo12)), proj.replace(/\n/g, ' · '));
confere('Projeção para 5 anos', proj.includes('5 anos'));
await page.getByText('E se…? (simular cortes e renda extra)').click();
await page.locator('#cenario-pct').selectOption('20');
await page.locator('#cenario-categoria').selectOption({ index: 1 });
const cenario = nb(await page.getByTestId('resultado-cenario').innerText());
confere('Cenário: cortar 20% de Alimentação → sobra R$ 2.299,36', cenario.includes('R$ 2.299,36'), cenario);
await page.locator('#cenario-extra').fill('500,00');
confere('Cenário: + R$ 500,00 de renda extra → sobra R$ 2.799,36', nb(await page.getByTestId('resultado-cenario').innerText()).includes('R$ 2.799,36'));
confere('Avisa quanto sobra quando um empréstimo terminar', nb(await page.getByTestId('fim-emprestimos').innerText()).includes('sobram +R$ 105,58 por mês'));
await verificarTela(page, 'Desejos (poupança) · celular');

// 2. Novo desejo
await page.getByRole('link', { name: 'Anotar o primeiro desejo' }).click();
await page.getByRole('button', { name: 'Salvar desejo' }).click();
confere('Validação: pede o que comprar e o preço', await page.getByText('O que você quer comprar?').isVisible() && await page.getByText('Informe o preço à vista.').isVisible());
await page.locator('#desejo-nome').fill('Viagem Porto Seguro');
await page.locator('#desejo-preco').fill('4.000,00');
await page.locator('#desejo-parcelado').check();
await page.locator('#desejo-parcelas').fill('10');
await page.locator('#desejo-valorParcela').fill('450,00');
await page.locator('#desejo-prioridade').selectOption('alta');
await page.locator('#desejo-porMes').fill('500,00');
await verificarTela(page, 'Novo desejo · celular');
await page.getByRole('button', { name: 'Salvar desejo' }).click();
await page.getByTestId('cartao-desejo').waitFor();
let cartao = nb(await page.getByTestId('cartao-desejo').innerText());
const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 8, 1);
confere('À vista x parcelado: 10x de R$ 450,00 = R$ 4.500,00', cartao.includes('10x de R$ 450,00 (= R$ 4.500,00)'));
confere('Pagando à vista economiza R$ 500,00', cartao.includes('você economiza R$ 500,00'));
confere(`Guardando R$ 500,00/mês consegue em 8 meses (${MESES[alvo.getMonth()]} de ${alvo.getFullYear()})`, cartao.includes(`8 meses (${MESES[alvo.getMonth()]} de ${alvo.getFullYear()})`), cartao.replace(/\n/g, ' · '));
confere('Mostra se cabe no orçamento', cartao.includes('Cabe com folga'));
confere('Mostra o peso da parcela na renda (6,9%)', cartao.includes('6,9% da sua renda'));
await page.screenshot({ path: join(CAPTURAS, 'desejos.png'), fullPage: true });

// 3. Transformar em cofrinho
await page.getByRole('link', { name: 'Transformar em cofrinho' }).click();
await page.getByRole('heading', { name: 'Novo cofrinho' }).waitFor();
confere('Cofrinho vem preenchido com o desejo (nome, meta, valor por mês)', (await page.locator('#cofrinho-nome').inputValue()) === 'Viagem Porto Seguro' && (await page.locator('#cofrinho-meta').inputValue()) === '4.000,00' && (await page.locator('#cofrinho-deposito').inputValue()) === '500,00');
await page.getByRole('button', { name: 'Criar cofrinho' }).click();
await page.getByTestId('saldo-cofrinho').waitFor();
await page.getByRole('button', { name: 'Registrar depósito' }).click();
await page.locator('#mov-valor').fill('1.150,00');
await page.locator('form').getByRole('button', { name: 'Registrar depósito' }).click();
await page.getByTestId('saldo-cofrinho').filter({ hasText: '1.150,00' }).waitFor({ timeout: 5000 }).catch(() => {});
await page.goto(`${URL_APP}/desejos`);
await page.getByTestId('cartao-desejo').waitFor();
cartao = nb(await page.getByTestId('cartao-desejo').innerText());
confere('Desejo usa o que já está no cofrinho (R$ 1.150,00) → 6 meses', cartao.includes('Já guardado no cofrinho: R$ 1.150,00') && cartao.includes('6 meses'), cartao.replace(/\n/g, ' · '));
confere('Desejo ligado mostra "Ver cofrinho"', await page.getByRole('link', { name: 'Ver cofrinho' }).isVisible());

// 4. Já comprei (com desfazer)
await page.getByRole('button', { name: 'Já comprei' }).click();
await page.getByText('Já comprados (1)').waitFor();
confere('"Já comprei" move para "Já comprados"', (await page.getByTestId('cartao-desejo').count()) === 0);
await page.getByTestId('aviso').getByRole('button', { name: 'Desfazer' }).click();
await page.getByTestId('cartao-desejo').waitFor();
confere('"Desfazer" volta o desejo para a lista', (await page.getByTestId('cartao-desejo').count()) === 1);

// 5. Notebook
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/desejos`);
await p2.getByRole('heading', { name: 'Desejos e planos' }).waitFor();
await verificarTela(p2, 'Desejos · notebook');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de desejos', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
