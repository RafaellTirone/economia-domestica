// Auditoria da "Foto do recibo": recibos de verdade são simulados (cupom NFC-e, maquininha, print de Pix),
// fotografados pelo robô (inclusive tortos e um pouco borrados) e lidos pelo app no aparelho.
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4171);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));

/** "Fotografa" um recibo: desenha o HTML numa página à parte e tira um print. */
// Celular de verdade tira foto com bem mais pixels que a tela: o "fotógrafo" usa 2,5x
const ctxFoto = await navegador.newContext({ deviceScaleFactor: 2.5 });
const fotografo = await ctxFoto.newPage();
async function foto(corpo, { girar = 0, borrar = 0, largura = 380, fundo = '#d8d4cc', fonte = "'DejaVu Sans Mono', monospace", tamanho = 15 } = {}) {
  await fotografo.setViewportSize({ width: largura + 120, height: 1400 });
  await fotografo.setContent(`<body style="margin:0;background:${fundo};padding:40px">
    <div id="r" style="width:${largura}px;background:#fffdf7;padding:18px;font:${tamanho}px/1.45 ${fonte};color:#222;white-space:pre-wrap;transform:rotate(${girar}deg);filter:blur(${borrar}px)">${corpo}</div></body>`);
  return fotografo.locator('body').screenshot({ type: 'jpeg', quality: 85 });
}

const NFCE_FARMACIA = `DROGARIA SAO JOAO LTDA
CNPJ: 12.345.678/0001-90
AV BRASIL, 1000 - CENTRO
DOCUMENTO AUXILIAR DA NOTA FISCAL
DE CONSUMIDOR ELETRONICA
------------------------------------
DIPIRONA 500MG    1 UN x 8,49   8,49
PROTETOR FPS50    1 UN x 46,41 46,41
------------------------------------
Qtd. total de itens               2
Valor total R$                54,90
Desconto R$                    5,00
Valor a pagar R$              49,90
FORMA PAGAMENTO          VALOR PAGO
Cartao de Debito              49,90
------------------------------------
NFC-e n 000123456  Serie 001
Emissao 31/10/2026 14:32:10`;

const SUPERMERCADO = `SUPERMERCADO BOM PRECO
CNPJ 98.765.432/0001-10
ARROZ TIPO 1 5KG  1 UN X 27,90 27,90
FEIJAO 1KG        2 UN X 8,49  16,98
OLEO SOJA 900ML   3 UN X 7,99  23,97
CAFE 500G         1 UN X 21,90 21,90
QTD. TOTAL DE ITENS              12
VALOR TOTAL R$               312,45
DINHEIRO                     350,00
TROCO R$                      37,55
29/10/2026 18:01`;

const MAQUININHA = `      STONE
   VIA CLIENTE
PADARIA PAO QUENTE
CNPJ: 11.222.333/0001-44
CREDITO A VISTA
************1234
VALOR:      R$ 23,50
31/10/26  08:15`;

const PIX = `Comprovante de transferência

Pix enviado

Valor
R$ 150,00

Data e hora
30/10/2026 - 19:42

Para
JOSE DA SILVA`;

async function lerFoto(imagem) {
  await page.goto(`${URL_APP}/lancar`);
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  await page.getByRole('button', { name: 'Foto do recibo' }).click();
  await page.getByTestId('foto-recibo').waitFor();
  const t0 = Date.now();
  await page.getByTestId('entrada-galeria').setInputFiles({ name: 'recibo.jpg', mimeType: 'image/jpeg', buffer: imagem });
  await page.getByTestId('resultado-recibo').waitFor({ timeout: 90000 });
  return Date.now() - t0;
}
const valorLido = async () => nb(await page.getByTestId('valor-lido').innerText());

// 1. Cupom de farmácia (NFC-e com desconto)
let ms = await lerFoto(await foto(NFCE_FARMACIA));
confere(`Farmácia: leu "Valor a pagar" R$ 49,90 (não o total sem desconto) em ${(ms / 1000).toFixed(1)} s`, (await valorLido()) === 'R$ 49,90', await valorLido());
confere('Pergunta "O valor R$ 49,90 está certo?"', nb(await page.getByTestId('foto-recibo').innerText()).includes('O valor R$ 49,90 está certo?'));
confere('Mostra a farmácia e a data lidas', nb(await page.getByTestId('resultado-recibo').innerText()).includes('DROGARIA SAO JOAO') && nb(await page.getByTestId('resultado-recibo').innerText()).includes('31/10/2026'));
await verificarTela(page, 'Foto do recibo · resultado · celular');
await page.getByRole('button', { name: 'Sim, usar este valor' }).click();
confere('Confirmou: valor 49,90 no lançamento', (await page.locator('#campo-valor').inputValue()) === '49,90');
confere('Categoria sugerida: Saúde › Farmácia', (await page.getByRole('button', { name: 'Saúde', exact: true }).getAttribute('aria-pressed')) === 'true'
  && (await page.getByRole('button', { name: 'Farmácia', exact: true }).getAttribute('aria-pressed')) === 'true');
confere('Descrição e data vieram do recibo', (await page.getByLabel(/Descrição/).inputValue()) === 'DROGARIA SAO JOAO' && (await page.locator('#campo-data').inputValue()) === '31/10/2026');
confere('Lembrete "Valor lido da foto… Confira"', await page.getByTestId('aviso-valor-foto').isVisible());
await page.locator('form button[type=submit]').click();
await page.getByTestId('aviso').waitFor();
confere('Salvou "Despesa de R$ 49,90"', nb(await page.getByTestId('aviso').innerText()).includes('Despesa de R$ 49,90 salva.'));

// 2. Supermercado fotografado torto e um pouco borrado
ms = await lerFoto(await foto(SUPERMERCADO, { girar: 2, borrar: 0.5 }));
confere(`Supermercado torto/borrado: R$ 312,45 (não o troco) em ${(ms / 1000).toFixed(1)} s`, (await valorLido()) === 'R$ 312,45', await valorLido());

// 3. Comprovante da maquininha
await lerFoto(await foto(MAQUININHA));
confere('Maquininha: R$ 23,50', (await valorLido()) === 'R$ 23,50', await valorLido());
confere('Maquininha: mostra a padaria, não "STONE"', nb(await page.getByTestId('resultado-recibo').innerText()).includes('PADARIA PAO QUENTE'));

// 4. Print de Pix (letra de celular, sem ser monoespaçada)
await lerFoto(await foto(PIX, { fonte: 'Arial, sans-serif', tamanho: 18, fundo: '#ffffff' }));
confere('Print de Pix: R$ 150,00 e quem recebeu', (await valorLido()) === 'R$ 150,00' && nb(await page.getByTestId('resultado-recibo').innerText()).includes('JOSE DA SILVA'), await valorLido());

// 5. Escolher outro valor e "Corrigir no formulário"
await lerFoto(await foto(NFCE_FARMACIA));
await page.getByRole('group', { name: /Toque no valor certo/ }).getByRole('button', { name: 'R$ 54,90' }).click();
confere('Tocar em outro valor troca a pergunta para R$ 54,90', nb(await page.getByTestId('foto-recibo').innerText()).includes('O valor R$ 54,90 está certo?'));
await page.getByRole('button', { name: 'Corrigir no formulário' }).click();
await page.waitForFunction(() => document.activeElement?.id === 'campo-valor', null, { timeout: 3000 }).catch(() => {});
confere('Corrigir: valor no campo, pronto para editar', (await page.locator('#campo-valor').inputValue()) === '54,90' && (await page.evaluate(() => document.activeElement?.id)) === 'campo-valor');

// 6. Foto sem recibo
await lerFoto(await foto('Bom dia! Foto de um gato.'));
confere('Foto sem valor: avisa e oferece outra foto', nb(await page.getByTestId('resultado-recibo').innerText()).includes('Não encontrei o valor') && await page.getByRole('button', { name: 'Tirar outra foto' }).isVisible());

// 7. Depois da primeira vez, funciona sem internet
await page.goto(`${URL_APP}/lancar`);
await page.evaluate(() => navigator.serviceWorker?.ready);
await page.reload();
await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
await ctx.setOffline(true);
ms = await lerFoto(await foto(MAQUININHA));
confere(`Sem internet: lê a foto (R$ 23,50) em ${(ms / 1000).toFixed(1)} s`, (await valorLido()) === 'R$ 23,50', await valorLido());
await ctx.setOffline(false);

// 8. Trava de segurança: só o leitor pode buscar arquivos; a tela continua sem poder enviar nada
const cspPagina = (await (await page.request.get(URL_APP)).headers())['content-security-policy'];
const cspLeitor = (await (await page.request.get(`${URL_APP}/ocr/worker.min.js`)).headers())['content-security-policy'];
confere('Tela do app continua com connect-src none', cspPagina.includes("connect-src 'none'"));
confere('Leitor de fotos tem trava própria (só o próprio site)', cspLeitor.includes("connect-src 'self'") && cspLeitor.includes("'wasm-unsafe-eval'") && !cspLeitor.includes('*'));
const precache = await (await page.request.get(`${URL_APP}/precache.json`)).json();
confere('Leitor (5 MB) não é baixado na instalação, só no primeiro uso', !precache.some((a) => a.startsWith('/ocr/')));

confere('Nenhum erro no console durante a auditoria da foto', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
