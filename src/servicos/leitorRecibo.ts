import type { Centavos, DataISO } from '../tipos';
import { hojeISO, lerData } from '../utils/datas';

// Entende o texto lido de um recibo (cupom fiscal NFC-e/SAT, comprovante de cartão, print de Pix)
// e encontra o VALOR PAGO, a data, o nome da loja e uma categoria provável.
// Nunca lança sozinho: a tela sempre mostra o que achou e pede confirmação.

export interface Candidato { valor: Centavos; linha: string; pontos: number; motivo: string }

export interface ResultadoRecibo {
  /** Valor mais provável (null = não achou nenhum valor). */
  valor: Centavos | null;
  /** Outros valores encontrados, do mais para o menos provável (para a pessoa escolher). */
  candidatos: Candidato[];
  confianca: 'alta' | 'media' | 'baixa';
  data: DataISO | null;
  estabelecimento: string | null;
  sugestao: { categoria: string; subcategoria?: string } | null;
}

/**
 * Corrige confusões típicas do leitor em números: O→0, l/I→1, S→5, B→8 quando estão no meio de
 * dígitos; "54 ,90" → "54,90"; "R$54.90" → "R$ 54,90" (ponto como decimal no fim).
 */
export function limparNumeros(linha: string): string {
  let t = linha.replace(/(?<=\d)[ ]?([.,])[ ]?(?=\d{2}\b)/g, '$1');
  t = t.replace(/(?<=[\d.,])[oO](?=[\d.,]|\b)|(?<=\b)[oO](?=[\d]{1,2}[.,]\d)/g, '0');
  t = t.replace(/(?<=\d)[lI|](?=\d)|(?<=\d[.,])[lI|](?=\d)/g, '1');
  t = t.replace(/(?<=\d)[sS](?=\d)/g, '5');
  // Última casa dos centavos lida como letra: "312,4S" → "312,45"; "27,9O" → "27,90"
  t = t.replace(/(?<=[.,]\d)[sS](?![A-Za-z])/g, '5').replace(/(?<=[.,]\d)[oO](?![A-Za-z])/g, '0');
  return t;
}

/** Todos os valores em reais de uma linha (aceita 1.234,56 · 1234,56 · 1234.56 · R$ 5,00). */
export function valoresDaLinha(linha: string): Centavos[] {
  const t = limparNumeros(linha);
  const achados: Centavos[] = [];
  const re = /(?<![\d/:])(\d{1,3}(?:\.\d{3})+|\d+)[,.](\d{2})(?![\d/%])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    // "1.234.56" (pontos de milhar + ponto decimal) e "12,345" (3 casas = quantidade/kg) ficam de fora
    const inteiro = Number(m[1].replace(/\./g, ''));
    if (!Number.isFinite(inteiro) || inteiro > 9_999_999) continue;
    achados.push(inteiro * 100 + Number(m[2]));
  }
  return achados;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Palavras que indicam o valor final pago (quanto maior o peso, mais confiável)
const PISTAS: [RegExp, number, string][] = [
  [/VALOR\s*(A\s*)?PAGAR|VALOR\s*PAGO|TOTAL\s*(A\s*)?PAGAR|TOTAL\s*PAGO/, 100, 'valor a pagar'],
  [/VALOR\s*TOTAL|TOTAL\s*(DA\s*)?(COMPRA|NOTA|CUPOM|GERAL)|TOTAL\s*R\$/, 80, 'valor total'],
  [/^\W*TOTAL\b/, 70, 'total'],
  [/VALOR\s*(DO\s*)?(PIX|PAGAMENTO|TRANSFERENCIA)|^\W*VALOR\b/, 75, 'valor do pagamento'],
  [/CARTAO\s*(DE\s*)?(CREDITO|DEBITO)|\b(CREDITO|DEBITO)\b|\bPIX\b|DINHEIRO|VALE\s*(REFEICAO|ALIMENTACAO)/, 40, 'forma de pagamento'],
];
// Linhas que NUNCA são o valor pago
const NAO_E: RegExp[] = [
  /SUB\s*-?\s*TOTAL/, /TROCO/, /DESCONTO|DESC\b/, /ACRESCIMO/, /TRIBUTO|IMPOSTO|ICMS|PIS|COFINS|LEI\s*\d|12\.?741|IBPT|APROX/,
  /QTD|QTDE|QUANTIDADE|ITENS?\b/, /SALDO|LIMITE\s*DISPONIVEL/, /CPF|CNPJ|CHAVE|PROTOCOLO|SERIE|NUMERO|N[ºO°]\s*\d/, /TAXA\s*DE\s*SERVICO|GORJETA|SERVICO\s*\(?10/,
  /\bUN\b|\bKG\b|\bX\s*\d|VL\s*UNIT|UNIT/,
];

/** Primeira data plausível do texto (dd/mm/aaaa ou dd/mm/aa), que não seja no futuro. */
function acharData(linhas: string[], hoje: DataISO): DataISO | null {
  for (const l of linhas) {
    for (const m of limparNumeros(l).matchAll(/\b(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/g)) {
      const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
      const d = lerData(`${m[1]}/${m[2]}/${ano}`);
      if (d && d <= hoje && d >= `${Number(hoje.slice(0, 4)) - 2}-01-01`) return d;
    }
  }
  return null;
}

/** Nome da loja: no Pix, quem recebeu ("Para"); no cupom, a primeira linha "de texto" do topo. */
function acharEstabelecimento(linhas: string[]): string | null {
  const limpar = (t: string) => t.replace(/\s{2,}/g, ' ').replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A)\b\.?/gi, '').trim().slice(0, 60) || null;
  for (let i = 0; i < linhas.length; i++) {
    const m = semAcento(linhas[i]).match(/^(PARA|RECEBEDOR|DESTINO|DESTINATARIO|FAVORECIDO|QUEM RECEBEU|NOME DO RECEBEDOR)\b\s*:?\s*(.*)$/);
    if (!m) continue;
    const nome = m[2] ? linhas[i].slice(linhas[i].length - m[2].length) : linhas[i + 1];
    if (nome && /[A-Za-zÀ-ú]{3}/.test(nome)) return limpar(nome);
  }
  for (const l of linhas.slice(0, 6)) {
    const t = l.trim();
    const letras = (t.match(/[A-Za-zÀ-ú]/g) ?? []).length;
    if (letras < 4 || letras / t.length < 0.6) continue;
    if (/CNPJ|CPF|DOCUMENTO|CUPOM|NFC|NOTA|DANFE|EXTRATO|COMPROVANTE|RUA|AV\.|AVENIDA|BAIRRO|IE\b/.test(semAcento(t))) continue;
    // Nome da maquininha não é a loja
    if (/^(STONE|CIELO|REDE|GETNET|PAGSEGURO|PAGBANK|MERCADO\s*PAGO|SUMUP|SAFRAPAY|TON|VIA\s*(DO\s*)?CLIENTE|VIA\s*ESTABELECIMENTO)\b/.test(semAcento(t))) continue;
    return limpar(t);
  }
  return null;
}

// Palavras do recibo → categoria/subcategoria do app (nomes das categorias padrão)
const CATEGORIAS: [RegExp, string, string?][] = [
  [/FARMACIA|DROGARIA|DROGASIL|DROGA\s*RAIA|RAIA\b|PAGUE\s*MENOS|PANVEL|ULTRAFARMA|DROGAO|MEDICAMENTO|REMEDIO/, 'Saúde', 'Farmácia'],
  [/POSTO|COMBUSTIVE|GASOLINA|ETANOL|DIESEL|SHELL|IPIRANGA|PETROBRAS|\bBR\b\s*DISTRIBUIDORA|ALE\s*COMB/, 'Transporte', 'Combustível'],
  [/PADARIA|PANIFICADORA|PAO\s*DE\s*QUEIJO|CONFEITARIA/, 'Alimentação', 'Padaria'],
  [/ACOUGUE|CASA\s*DE\s*CARNES|FRIGORIFICO|BOUTIQUE\s*DE\s*CARNES/, 'Alimentação', 'Açougue'],
  [/HORTIFRUTI|SACOLAO|VERDURAO|FEIRA|FRUTAS/, 'Alimentação', 'Feira / hortifrúti'],
  [/IFOOD|RAPPI|AIQFOME|DELIVERY|ENTREGA/, 'Alimentação', 'Delivery'],
  [/RESTAURANTE|LANCHONETE|PIZZARIA|HAMBURGUER|CHURRASCARIA|BAR\s|CAFE\b|CAFETERIA|SELF\s*SERVICE/, 'Alimentação', 'Restaurante'],
  [/SUPERMERCADO|MERCADO|ATACAD|ASSAI|CARREFOUR|EXTRA\b|PAO\s*DE\s*ACUCAR|BIG\b|COMERCIAL\s*DE\s*ALIMENTOS|MERCEARIA|EMPORIO/, 'Alimentação', 'Compra do mês'],
  [/ENERGIA|ELETRICIDADE|CEMIG|ENEL|LIGHT\b|CPFL|COPEL|CELESC|EQUATORIAL|NEOENERGIA|COELBA|ELEKTRO|ENERGISA/, 'Contas da casa', 'Luz'],
  [/SANEAMENTO|SABESP|COPASA|CEDAE|SANEPAR|EMBASA|CAGECE|COMPESA|CORSAN|AGUA\s*E\s*ESGOTO/, 'Contas da casa', 'Água'],
  [/TELECOM|INTERNET|FIBRA|VIVO|CLARO|\bTIM\b|\bOI\b|NET\s*SERVICOS/, 'Contas da casa', 'Internet'],
  [/LOJAS?\s*RENNER|RIACHUELO|C\s*&\s*A|MARISA|CALCADOS|VESTUARIO|MODA/, 'Vestuário'],
  [/PET\s*SHOP|PETZ|COBASI|RACAO/, 'Casa e higiene', 'Pet'],
];

function sugerirCategoria(texto: string): ResultadoRecibo['sugestao'] {
  const t = semAcento(texto);
  for (const [re, categoria, subcategoria] of CATEGORIAS) if (re.test(t)) return { categoria, subcategoria };
  return null;
}

/** Analisa o texto do recibo e devolve o valor pago mais provável (com alternativas). */
export function analisarRecibo(texto: string, hoje: DataISO = hojeISO()): ResultadoRecibo {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidatos: Candidato[] = [];
  const formasPagamento: Centavos[] = [];

  linhas.forEach((linha, i) => {
    const u = semAcento(limparNumeros(linha));
    // Valor pode estar na mesma linha da palavra ou na de baixo ("Valor" / "R$ 54,90")
    let valores = valoresDaLinha(linha);
    let doLado = false;
    if (!valores.length && i + 1 < linhas.length && /TOTAL|VALOR|PAGAR|PAGO/.test(u)) { valores = valoresDaLinha(linhas[i + 1]); doLado = true; }
    if (!valores.length) return;
    const valor = valores[valores.length - 1]; // em cupom, o valor fica à direita
    if (valor <= 0) return;
    if (NAO_E.some((re) => re.test(u)) && !/VALOR\s*(A\s*)?PAGAR|TOTAL\s*(A\s*)?PAGAR/.test(u)) return;
    const pista = PISTAS.find(([re]) => re.test(u));
    let pontos = pista ? pista[1] : 5;
    if (pista?.[2] === 'forma de pagamento') formasPagamento.push(valor);
    if (/R\s*\$/.test(linha)) pontos += 10;
    if (doLado) pontos -= 5;
    // Totais costumam estar na metade de baixo do cupom
    if (i > linhas.length / 2) pontos += 5;
    candidatos.push({ valor, linha: doLado ? `${linha} ${linhas[i + 1]}` : linha, pontos, motivo: pista?.[2] ?? 'valor encontrado' });
  });

  // Soma das formas de pagamento = total? Reforça esse valor (conferência cruzada do cupom)
  const somaFormas = formasPagamento.reduce((s, v) => s + v, 0);
  for (const c of candidatos) {
    if (somaFormas && c.valor === somaFormas && c.motivo !== 'forma de pagamento') { c.pontos += 30; c.motivo += ' (bate com o pagamento)'; }
  }
  // Sem nenhuma pista: o maior valor costuma ser o total
  if (candidatos.length && candidatos.every((c) => c.pontos < 40)) {
    const maior = candidatos.reduce((a, b) => (b.valor > a.valor ? b : a));
    maior.pontos += 20; maior.motivo = 'maior valor do recibo';
  }

  // Junta repetidos (mesmo valor em várias linhas soma confiança)
  const porValor = new Map<Centavos, Candidato>();
  for (const c of candidatos) {
    const ja = porValor.get(c.valor);
    if (!ja) porValor.set(c.valor, { ...c });
    else { if (c.pontos > ja.pontos) { ja.linha = c.linha; ja.motivo = c.motivo; } ja.pontos = Math.max(ja.pontos, c.pontos) + 10; }
  }
  const ordenados = [...porValor.values()].sort((a, b) => b.pontos - a.pontos || b.valor - a.valor);
  const melhor = ordenados[0];
  const confianca = !melhor ? 'baixa' : melhor.pontos >= 100 ? 'alta' : melhor.pontos >= 70 ? 'media' : 'baixa';
  return {
    valor: melhor?.valor ?? null,
    candidatos: ordenados.slice(0, 6),
    confianca,
    data: acharData(linhas, hoje),
    estabelecimento: acharEstabelecimento(linhas),
    sugestao: sugerirCategoria(texto),
  };
}
