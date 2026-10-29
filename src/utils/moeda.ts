import type { Centavos } from '../tipos';

// Tudo sobre dinheiro: exibir em Real (R$ 1.234,56) e ler o que a pessoa digita.
// Internamente o valor é sempre um número inteiro de centavos.

const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (com espaço que não quebra linha entre R$ e o número). */
export function formatarMoeda(centavos: Centavos): string {
  return formatoReal.format(centavos / 100);
}

/** Igual a formatarMoeda, mas com sinal explícito: "+ R$ 700,00" / "− R$ 18,50". */
export function formatarMoedaComSinal(centavos: Centavos): string {
  if (centavos === 0) return formatarMoeda(0);
  return `${centavos > 0 ? '+' : '−'} ${formatarMoeda(Math.abs(centavos))}`;
}

/**
 * Lê um valor digitado e devolve centavos (ou null se não for um valor válido).
 * Aceita: "1.234,56", "R$ 72", "72,5", "0,01", "1234.56" (ponto como decimal só com 1–2 casas no fim).
 * Não usa conta com vírgula flutuante: separa reais e centavos como texto.
 */
export function lerValor(texto: string): Centavos | null {
  let t = texto.replace(/R\$/gi, '').replace(/[\s ]/g, '');
  const negativo = /^[-−]/.test(t);
  t = t.replace(/^[-−+]/, '');
  if (!t || !/^[\d.,]+$/.test(t)) return null;

  let reais: string;
  let centavos = '';
  if (t.includes(',')) {
    // Vírgula é o separador decimal; pontos são de milhar.
    const partes = t.split(',');
    if (partes.length !== 2) return null;
    reais = partes[0].replace(/\./g, '');
    centavos = partes[1];
  } else {
    // Sem vírgula: um ponto seguido de 1 ou 2 dígitos no fim é decimal ("72.50"); senão, milhar ("1.234").
    const m = t.match(/^(.*)\.(\d{1,2})$/);
    if (m && !m[1].includes('.')) {
      reais = m[1];
      centavos = m[2];
    } else {
      reais = t.replace(/\./g, '');
    }
  }
  if (!/^\d*$/.test(reais) || !/^\d{0,2}$/.test(centavos)) return null;
  if (reais === '' && centavos === '') return null;

  const valor = Number(reais || '0') * 100 + Number(centavos.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(valor)) return null;
  return negativo ? -valor : valor;
}

/** Percentual no formato brasileiro: 19.81 → "19,8%". */
export function formatarPercentual(valor: number, casas = 1): string {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Soma uma lista de centavos (sempre inteiro). */
export function somar(valores: Centavos[]): Centavos {
  return valores.reduce((total, v) => total + v, 0);
}
