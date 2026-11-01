// Auditoria do contrato escaneado: o robô "escaneia" um contrato (imagem, sem texto dentro do PDF)
// e também tira uma foto torta dele. O app tem que ler o texto pela imagem e preencher os campos.
// Uso: npm run build && npm run test:e2e
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4169);
const PASTA = join(process.cwd(), 'tests', 'arquivos-teste');
mkdirSync(PASTA, { recursive: true });
const navegador = await playwright.chromium.launch();

const LINHAS = [
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
];

/** "Escaneia" a página do contrato: desenha num papel A4 e tira uma foto (JPEG). */
const ctxFoto = await navegador.newContext({ deviceScaleFactor: 2 });
const scanner = await ctxFoto.newPage();
async function escanear({ girar = 0, borrar = 0 } = {}) {
  await scanner.setViewportSize({ width: 700, height: 1000 });
  await scanner.setContent(`<body style="margin:0;background:#cfcac0;padding:20px">
    <div style="width:595px;height:842px;background:#fbfaf6;padding:40px 36px;box-sizing:border-box;font:13px/1.6 'DejaVu Serif',serif;color:#1d1d1d;transform:rotate(${girar}deg);filter:blur(${borrar}px)">
    ${LINHAS.map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')}</div></body>`);
  return scanner.locator('body > div').screenshot({ type: 'jpeg', quality: 80 });
}

/** PDF com uma página que é só uma imagem (como sai de um scanner): nenhum texto para copiar. */
function pdfComImagem(jpeg) {
  // Tamanho da imagem: lido do cabeçalho do JPEG (marcador SOF)
  let i = 2, largura = 0, altura = 0;
  while (i < jpeg.length) {
    const marcador = jpeg[i + 1], tamanho = jpeg.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xc2) { altura = jpeg.readUInt16BE(i + 5); largura = jpeg.readUInt16BE(i + 7); break; }
    i += 2 + tamanho;
  }
  const conteudo = 'q 595 0 0 842 0 0 cm /Im1 Do Q';
  const partes = [
    Buffer.from('%PDF-1.4\n'),
  ];
  const posicoes = [];
  const obj = (n, corpo) => { posicoes[n] = Buffer.concat(partes).length; partes.push(Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'latin1')); };
  obj(1, '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(2, '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(3, '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  obj(4, Buffer.concat([Buffer.from(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'), jpeg, Buffer.from('\nendstream\nendobj\n')]));
  obj(5, `5 0 obj\n<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream\nendobj\n`);
  const xref = Buffer.concat(partes).length;
  partes.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(posicoes[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

const ESCANEADO = join(PASTA, 'contrato-escaneado-imagem.pdf');
writeFileSync(ESCANEADO, pdfComImagem(await escanear()));
const FOTO = join(PASTA, 'contrato-foto.jpg');
writeFileSync(FOTO, await escanear({ girar: 1.5, borrar: 0.4 }));

const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
const valorDe = (id) => page.locator(`#campo-${id}`).inputValue();

async function anexar(arquivo) {
  await page.goto(`${URL_APP}/dividas/novo`);
  await page.getByRole('heading', { name: 'Cadastrar empréstimo' }).waitFor();
  const t0 = Date.now();
  await page.locator('#campo-contrato').setInputFiles(arquivo);
  await page.getByTestId('resultado-leitura').filter({ hasText: /encontrei|não reconheci|não consegui/ }).waitFor({ timeout: 120000 });
  return Date.now() - t0;
}

// 1. PDF escaneado (só imagem)
let ms = await anexar(ESCANEADO);
const msg = nb(await page.getByTestId('resultado-leitura').innerText());
confere(`PDF escaneado: lido pela imagem em ${(ms / 1000).toFixed(1)} s`, msg.includes('pela imagem') && msg.includes('encontrei'), msg);
confere('Escaneado: valor do empréstimo R$ 10.000,00', (await valorDe('valorEmprestado')) === '10.000,00', await valorDe('valorEmprestado'));
confere('Escaneado: 36 parcelas de R$ 385,43', (await valorDe('numeroParcelas')) === '36' && (await valorDe('valorParcela')) === '385,43', `${await valorDe('numeroParcelas')} x ${await valorDe('valorParcela')}`);
confere('Escaneado: taxa 1,89% ao mês', (await valorDe('taxaJuros')) === '1,89', await valorDe('taxaJuros'));
confere('Escaneado: multa 2% e juros de mora 1%', (await valorDe('multaAtraso')) === '2' && (await valorDe('jurosMora')) === '1', `${await valorDe('multaAtraso')} / ${await valorDe('jurosMora')}`);
confere('Escaneado: avisa para conferir (leitura de imagem)', msg.includes('pode trocar algum número'));
await verificarTela(page, 'Contrato escaneado lido · celular');

// 2. Foto do contrato (torta e um pouco borrada)
ms = await anexar(FOTO);
confere(`Foto do contrato (torta): lida em ${(ms / 1000).toFixed(1)} s`, nb(await page.getByTestId('resultado-leitura').innerText()).includes('encontrei'));
confere('Foto: valor R$ 10.000,00 e parcela R$ 385,43', (await valorDe('valorEmprestado')) === '10.000,00' && (await valorDe('valorParcela')) === '385,43', `${await valorDe('valorEmprestado')} / ${await valorDe('valorParcela')}`);

confere('Nenhum erro no console durante a leitura de contrato escaneado', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
