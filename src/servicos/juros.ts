import type { Centavos, PeriodoTaxa } from '../tipos';

// Matemática financeira do app. Taxas em % (1.89 = 1,89%). Dinheiro em centavos.
// Juros do contrato são compostos (padrão dos bancos). Juros de mora por atraso são
// simples e proporcionais aos dias (padrão "pro rata die").

const DIAS: Record<PeriodoTaxa, number> = { dia: 1, mes: 30, ano: 360 };

/** Converte uma taxa composta entre dia, mês e ano. Ex.: 1,89% ao mês → 25,19% ao ano. */
export function converterTaxa(taxa: number, de: PeriodoTaxa, para: PeriodoTaxa): number {
  if (de === para) return taxa;
  return ((1 + taxa / 100) ** (DIAS[para] / DIAS[de]) - 1) * 100;
}

/** Parcela da Tabela Price (parcelas iguais). */
export function parcelaPrice(valor: Centavos, taxaMensal: number, n: number): Centavos {
  const i = taxaMensal / 100;
  if (i === 0) return Math.round(valor / n);
  return Math.round((valor * i) / (1 - (1 + i) ** -n));
}

export interface LinhaTabela {
  numero: number;
  parcela: Centavos;
  juros: Centavos;
  amortizacao: Centavos;
  saldoDepois: Centavos;
}

/** Tabela de parcelas (Price ou SAC): quanto de cada parcela é juro e quanto abate a dívida. */
export function tabelaDeParcelas(valor: Centavos, taxaMensal: number, n: number, sistema: 'price' | 'sac' = 'price'): LinhaTabela[] {
  const i = taxaMensal / 100;
  const linhas: LinhaTabela[] = [];
  let saldo = valor;
  const pmt = parcelaPrice(valor, taxaMensal, n);
  const amortSac = Math.round(valor / n);
  for (let k = 1; k <= n; k++) {
    const juros = Math.round(saldo * i);
    let amortizacao = sistema === 'sac' ? amortSac : pmt - juros;
    if (k === n) amortizacao = saldo; // última parcela zera o saldo (ajuste de centavos)
    saldo -= amortizacao;
    linhas.push({ numero: k, parcela: juros + amortizacao, juros, amortizacao, saldoDepois: saldo });
  }
  return linhas;
}

/** Saldo devedor: valor presente das parcelas que faltam (é o valor para quitar hoje, sem juros futuros). */
export function saldoDevedor(parcela: Centavos, taxaMensal: number, parcelasRestantes: number): Centavos {
  const i = taxaMensal / 100;
  if (parcelasRestantes <= 0) return 0;
  if (i === 0) return parcela * parcelasRestantes;
  return Math.round((parcela * (1 - (1 + i) ** -parcelasRestantes)) / i);
}

/**
 * Descobre a taxa mensal a partir do valor emprestado, da parcela e do número de parcelas
 * (útil quando o contrato não informa a taxa, ou para conferir a taxa informada).
 */
export function taxaImplicita(valor: Centavos, parcela: Centavos, n: number): number | null {
  if (valor <= 0 || parcela <= 0 || n <= 0) return null;
  if (parcela * n <= valor) return 0;
  let baixo = 0, alto = 100;
  for (let k = 0; k < 200; k++) {
    const meio = (baixo + alto) / 2;
    const i = meio / 100;
    const pv = (parcela * (1 - (1 + i) ** -n)) / i;
    if (pv > valor) baixo = meio; else alto = meio;
  }
  return (baixo + alto) / 2;
}

export interface Encargos {
  diasAtraso: number;
  multa: Centavos;
  mora: Centavos;
  /** Quanto a mora aumenta por dia. */
  moraPorDia: Centavos;
  total: Centavos;
}

/**
 * Encargos de uma parcela atrasada: multa (uma vez) + juros de mora por dia.
 * Ex.: R$ 105,58, 4 dias, multa 2%, mora 1% ao mês → multa 2,11 + mora 0,14 = R$ 107,83.
 */
export function encargosDeAtraso(parcela: Centavos, diasAtraso: number, multaPct: number, moraPct: number, periodoMora: PeriodoTaxa): Encargos {
  if (diasAtraso <= 0) return { diasAtraso: 0, multa: 0, mora: 0, moraPorDia: 0, total: parcela };
  const moraDiaria = moraPct / 100 / DIAS[periodoMora];
  const multa = Math.round((parcela * multaPct) / 100);
  const mora = Math.round(parcela * moraDiaria * diasAtraso);
  return { diasAtraso, multa, mora, moraPorDia: Math.round(parcela * moraDiaria), total: parcela + multa + mora };
}

/** Taxa formatada no padrão brasileiro: 1.89 → "1,89%". */
export function formatarTaxa(taxa: number, casas = 2): string {
  return `${taxa.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export const NOME_PERIODO: Record<PeriodoTaxa, string> = { dia: 'ao dia', mes: 'ao mês', ano: 'ao ano' };
