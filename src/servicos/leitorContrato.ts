import type { Centavos, DataISO, PeriodoTaxa, TipoEmprestimo } from '../tipos';
import { lerData, lerDataPorExtenso } from '../utils/datas';
import { lerValor } from '../utils/moeda';

// Leitor de contrato: lê o texto do PDF DENTRO do aparelho (nada é enviado para a internet)
// e procura os termos que importam. Cada termo encontrado vem com o trecho do contrato de onde
// saiu, para a pessoa conferir. O app nunca usa um termo lido sem a pessoa confirmar.

export interface TermosLidos {
  numeroContrato?: string;
  instituicao?: string;
  tipo?: TipoEmprestimo;
  valorEmprestado?: Centavos;
  numeroParcelas?: number;
  valorParcela?: Centavos;
  taxaJuros?: number;
  periodoTaxa?: PeriodoTaxa;
  cetAnual?: number;
  sistema?: 'price' | 'sac';
  multaAtraso?: number;
  jurosMora?: number;
  periodoMora?: PeriodoTaxa;
  dataPrimeiraParcela?: DataISO;
  dataContratacao?: DataISO;
}

export interface ResultadoLeitura {
  termos: TermosLidos;
  /** Trecho do contrato de onde saiu cada termo. */
  trechos: Partial<Record<keyof TermosLidos, string>>;
  encontrados: number;
}

const NUM = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,4})?|\\d+(?:,\\d{1,4})?)';
const DINHEIRO = 'R\\$\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})';
const PERIODO = '(a\\.?\\s?m\\.?|ao\\s+m[eê]s|mensa(?:l|is)|a\\.?\\s?a\\.?|ao\\s+ano|anua(?:l|is)|a\\.?\\s?d\\.?|ao\\s+dia|di[aá]ri[oa]s?)';
const DATA = '(\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{1,2}(?:º|°)?\\s+de\\s+[A-Za-zÀ-ú]+\\s+de\\s+\\d{4})';
/** Lê "10/03/2025" ou "10 de março de 2025". */
const lerQualquerData = (t: string) => lerData(t) ?? lerDataPorExtenso(t);

/** Bancos e financeiras mais comuns em empréstimos no Brasil (para reconhecer o nome no texto). */
const BANCOS_CONHECIDOS = [
  'Banco do Brasil', 'Caixa Econômica Federal', 'Itaú Unibanco', 'Itaú Consignado', 'Itaú', 'Bradesco Financiamentos', 'Bradesco', 'Santander',
  'Nubank', 'Nu Financeira', 'Banco Inter', 'C6 Bank', 'Banco BMG', 'BMG', 'Banco Pan', 'Banco Daycoval', 'Daycoval', 'Banco Safra', 'Safra',
  'Banco Mercantil', 'Mercantil do Brasil', 'Agibank', 'Banrisul', 'Sicoob', 'Sicredi', 'Crefisa', 'Facta Financeira', 'Banco Olé', 'BRB',
  'Banco BV', 'Banco Votorantim', 'PicPay', 'Mercado Pago', 'Banco Cetelem', 'Banco Pine', 'Paraná Banco', 'Banco Master', 'Banco do Nordeste',
];

/** "1,89" → 1.89 */
const numero = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));

function periodo(t: string | undefined): PeriodoTaxa | undefined {
  if (!t) return undefined;
  const s = t.toLowerCase().replace(/\s/g, '');
  if (/^(a\.?m|aom|mensa)/.test(s)) return 'mes';
  if (/^(a\.?a|aoano|anua)/.test(s)) return 'ano';
  if (/^(a\.?d|aodia|di[aá]ri)/.test(s)) return 'dia';
  return undefined;
}

/** Trecho de até ~140 letras em volta do que foi encontrado. */
function trecho(texto: string, inicio: number, fim: number): string {
  const a = Math.max(0, inicio - 50);
  const b = Math.min(texto.length, fim + 50);
  return `${a > 0 ? '…' : ''}${texto.slice(a, b).trim()}${b < texto.length ? '…' : ''}`;
}

/** Analisa o texto de um contrato e devolve os termos encontrados. */
export function analisarTextoContrato(textoOriginal: string): ResultadoLeitura {
  const texto = textoOriginal.replace(/\s+/g, ' ');
  const termos: TermosLidos = {};
  const trechos: ResultadoLeitura['trechos'] = {};

  const achar = (re: RegExp) => re.exec(texto);
  const guardar = (campo: keyof TermosLidos, m: RegExpExecArray) => { trechos[campo] = trecho(texto, m.index, m.index + m[0].length); };

  // Número do contrato: "CCB nº 123", "Contrato número 123", "Nº do contrato: 123", "Contrato: 123/2025"
  const COD = '([A-Z0-9][A-Z0-9.\\/-]{2,30}[A-Z0-9])';
  const DOC = '(?:contrato|c[ée]dula(?: de cr[ée]dito banc[áa]rio)?|ccb|opera[çc][ãa]o|proposta)';
  let m = achar(new RegExp(`${DOC}\\s*(?:n[º°o]\\.?|n\\.?\\s?[º°]|n[úu]mero)\\s*[:\\-]?\\s*${COD}`, 'i'))
    ?? achar(new RegExp(`(?:n[º°o]\\.?|n[úu]mero)\\s*(?:d[oa]\\s+)?${DOC}\\s*[:\\-]?\\s*${COD}`, 'i'))
    ?? achar(new RegExp(`\\b(?:contrato|ccb|proposta)\\s*:\\s*(?=[A-Z0-9./-]*\\d)${COD}`, 'i'));
  if (m) { termos.numeroContrato = m[1]; guardar('numeroContrato', m); }

  // Banco/instituição: pelo rótulo ("CREDOR: …", "Instituição financeira: …"), por um nome conhecido ou "Banco Fulano S.A."
  m = achar(/\b(?:credor(?:a)?|institui[çc][ãa]o\s+financeira|institui[çc][ãa]o\s+credora|mutuante|banco\s+credor|financeira)\s*:\s*([A-ZÀ-Ú0-9][^,;\n]{2,60}?)(?=\s*(?:,|;|-|–|\bCNPJ\b|\binscrit|\bcom sede\b|$))/i);
  if (m) { termos.instituicao = m[1].trim(); guardar('instituicao', m); }
  if (!termos.instituicao) {
    for (const nome of BANCOS_CONHECIDOS) {
      const re = new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:\\s+S\\.?\\/?A\\.?)?`, 'i');
      m = achar(re);
      if (m) { termos.instituicao = m[0].trim(); guardar('instituicao', m); break; }
    }
  }
  if (!termos.instituicao) {
    m = achar(/\b((?:Banco|Caixa Econ[ôo]mica|Cooperativa|Financeira)\s+(?:[A-ZÀ-Ú][\wÀ-ú&.-]*|S\.?\/?A\.?|do|da|de|dos)(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.-]*|S\.?\/?A\.?|do|da|de|dos)){0,4})/);
    if (m) { termos.instituicao = m[1].replace(/\s+(do|da|de|dos)$/i, '').trim(); guardar('instituicao', m); }
  }

  for (const [re, tipo] of [[/consignad[oa]/i, 'consignado'], [/ve[íi]culo|autom[óo]vel/i, 'veiculo'], [/im[óo]vel|habitacional/i, 'imovel']] as const) {
    m = achar(re);
    if (m) { termos.tipo = tipo; guardar('tipo', m); break; }
  }

  m = achar(new RegExp(`valor\\s+(?:total\\s+)?(?:do\\s+|da\\s+)?(?:empr[ée]stimo|financiamento|financiado|liberado|l[íi]quido(?:\\s+liberado)?|solicitado|principal|cr[ée]dito|contratado)[^R]{0,60}?${DINHEIRO}`, 'i'));
  if (m) { termos.valorEmprestado = lerValor(m[1]) ?? undefined; guardar('valorEmprestado', m); }

  m = achar(new RegExp(`valor\\s+d[ae]s?\\s+(?:cada\\s+)?(?:parcela|presta[çc][ãa]o)(?:\\s+mensal)?[^R]{0,40}?${DINHEIRO}`, 'i'))
    ?? achar(new RegExp(`(?:parcelas?|presta[çc](?:[ãa]o|[õo]es))\\s+(?:mensa(?:l|is)\\s+)?(?:iguais\\s+|fixas\\s+)?(?:e\\s+\\w+\\s+)?de\\s+${DINHEIRO}`, 'i'));
  if (m) { termos.valorParcela = lerValor(m[1]) ?? undefined; guardar('valorParcela', m); }

  m = achar(/(?:quantidade|n[úu]mero|qtde\.?)\s+de\s+(?:parcelas|presta[çc][õo]es)[^\d]{0,20}(\d{1,3})\b/i)
    ?? achar(/\b(\d{1,3})\s*\(?[a-zà-ú\s-]{0,30}\)?\s*(?:parcelas|presta[çc][õo]es)\b/i)
    ?? achar(/prazo(?:\s+total)?(?:\s+de)?[^\d]{0,15}(\d{1,3})\s*meses/i);
  if (m) { termos.numeroParcelas = Number(m[1]); guardar('numeroParcelas', m); }

  // Taxa de juros do contrato (não confundir com juros de mora). Prefere a taxa mensal.
  const reTaxa = new RegExp(`(?:taxa\\s+(?:efetiva\\s+|nominal\\s+)?(?:de\\s+)?juros|juros\\s+remunerat[óo]rios)(?:\\s+(?:efetiva|nominal|remunerat[óo]rios?|pr[ée]-?fixad[ao]s?))*[^\\d%]{0,40}?${NUM}\\s*%\\s*${PERIODO}?`, 'gi');
  const taxas = [...texto.matchAll(reTaxa)].filter((x) => !/mora/i.test(x[0]));
  const taxa = taxas.find((x) => periodo(x[2]) === 'mes') ?? taxas[0];
  if (taxa) { termos.taxaJuros = numero(taxa[1]); termos.periodoTaxa = periodo(taxa[2]) ?? 'mes'; guardar('taxaJuros', taxa as RegExpExecArray); }

  const ceTs = [...texto.matchAll(new RegExp(`(?:\\bCET\\b|custo\\s+efetivo\\s+total)[^\\d%]{0,60}?${NUM}\\s*%\\s*${PERIODO}?`, 'gi'))];
  const cet = ceTs.find((x) => periodo(x[2]) === 'ano') ?? ceTs[0];
  if (cet) {
    let v = numero(cet[1]);
    let per = periodo(cet[2]);
    // "CET: 2,05% a.m. e 27,58% a.a." — a taxa anual vem logo depois da mensal
    const depois = texto.slice((cet.index ?? 0) + cet[0].length).match(new RegExp(`^\\s*(?:e|ou|,|/|;)\\s*${NUM}\\s*%\\s*${PERIODO}`, 'i'));
    if (per !== 'ano' && depois && periodo(depois[2]) === 'ano') { v = numero(depois[1]); per = 'ano'; }
    termos.cetAnual = per === 'mes' ? ((1 + v / 100) ** 12 - 1) * 100 : v;
    guardar('cetAnual', cet as RegExpExecArray);
  }

  m = achar(/tabela\s+price|sistema\s+franc[êe]s/i);
  if (m) { termos.sistema = 'price'; guardar('sistema', m); }
  else {
    m = achar(/\bSAC\b|sistema\s+de\s+amortiza[çc][ãa]o\s+constante/i);
    if (m) { termos.sistema = 'sac'; guardar('sistema', m); }
  }

  m = achar(new RegExp(`multa(?:\\s+(?:morat[óo]ria|contratual|moratória|de\\s+mora|por\\s+atraso|compensat[óo]ria|n[ãa]o\\s+compensat[óo]ria))?[^%\\d]{0,60}?${NUM}\\s*%`, 'i'));
  if (m) { termos.multaAtraso = numero(m[1]); guardar('multaAtraso', m); }

  m = achar(new RegExp(`juros\\s+(?:de\\s+)?mora(?:t[óo]rios)?[^%\\d]{0,60}?${NUM}\\s*%\\s*${PERIODO}?`, 'i'));
  if (m) { termos.jurosMora = numero(m[1]); termos.periodoMora = periodo(m[2]) ?? 'mes'; guardar('jurosMora', m); }

  m = achar(new RegExp(`(?:(?:data\\s+(?:do\\s+|de\\s+)?)?primeir[oa]\\s+(?:vencimento|parcela|presta[çc][ãa]o)|vencimento\\s+da\\s+(?:1[ªa°º]|primeira)\\s+(?:parcela|presta[çc][ãa]o)|1[ªa°º]\\s+(?:parcela|presta[çc][ãa]o|vencimento))[^\\d]{0,40}?${DATA}`, 'i'));
  if (m) { termos.dataPrimeiraParcela = lerQualquerData(m[1]) ?? undefined; guardar('dataPrimeiraParcela', m); }

  // Data da contratação: "Data de emissão: 10/03/2025", "contratado em 10/03/2025", "São Paulo, 10 de março de 2025" (local e data)
  m = achar(new RegExp(`data\\s+(?:de\\s+|da\\s+|do\\s+)?(?:emiss[ãa]o|contrata[çc][ãa]o|assinatura|celebra[çc][ãa]o|libera[çc][ãa]o|contrato|opera[çc][ãa]o)[^\\d]{0,20}?${DATA}`, 'i'))
    ?? achar(new RegExp(`(?:contratad[oa]|firmad[oa]|assinad[oa]|celebrad[oa]|emitid[oa]|formalizad[oa])\\s+em\\s*:?\\s*${DATA}`, 'i'))
    ?? achar(new RegExp(`local\\s+e\\s+data\\s*:?[^\\d]{0,40}?${DATA}`, 'i'))
    ?? achar(new RegExp(`\\b[A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú]?[a-zà-ú]+){0,3}\\s*(?:\\/\\s*[A-Z]{2})?\\s*,\\s*(\\d{1,2}(?:º|°)?\\s+de\\s+[A-Za-zÀ-ú]+\\s+de\\s+\\d{4})`));
  if (m) { termos.dataContratacao = lerQualquerData(m[1]) ?? undefined; guardar('dataContratacao', m); }

  // Remove o que não foi possível interpretar
  for (const k of Object.keys(termos) as (keyof TermosLidos)[]) if (termos[k] === undefined || Number.isNaN(termos[k])) delete termos[k];
  const encontrados = Object.keys(termos).filter((k) => k !== 'periodoTaxa' && k !== 'periodoMora').length;
  return { termos, trechos, encontrados };
}

/**
 * Extrai o texto de um PDF no próprio aparelho. Se o PDF for uma foto/escaneado (sem texto),
 * devolve temTexto = false para a tela pedir o preenchimento à mão.
 */
export async function extrairTextoDoPdf(arquivo: Blob): Promise<{ texto: string; paginas: number; temTexto: boolean }> {
  const pdfjs = await import('pdfjs-dist');
  const { default: TrabalhadorPdf } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline');
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new TrabalhadorPdf();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  // isEvalSupported: false — modo seguro (proteção contra PDFs maliciosos)
  const doc = await pdfjs.getDocument({ data: dados, isEvalSupported: false, disableFontFace: true, enableXfa: false }).promise;
  const partes: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    partes.push(conteudo.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join(''));
  }
  const texto = partes.join('\n');
  await doc.destroy();
  return { texto, paginas: partes.length, temTexto: texto.replace(/\s/g, '').length > 40 };
}
