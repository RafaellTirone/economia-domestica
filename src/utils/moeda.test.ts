import { describe, expect, it } from 'vitest';
import { formatarMoeda, formatarMoedaComSinal, formatarPercentual, lerValor, somar } from './moeda';

// O navegador usa um espaço "que não quebra linha" entre R$ e o número; trocamos por espaço comum para comparar.
const n = (s: string) => s.replace(/ /g, ' ');

describe('formatarMoeda', () => {
  it('formata no padrão brasileiro', () => {
    expect(n(formatarMoeda(123456))).toBe('R$ 1.234,56');
    expect(n(formatarMoeda(0))).toBe('R$ 0,00');
    expect(n(formatarMoeda(1))).toBe('R$ 0,01');
    expect(n(formatarMoeda(100000000))).toBe('R$ 1.000.000,00');
  });
  it('mostra o sinal quando pedido', () => {
    expect(n(formatarMoedaComSinal(70000))).toBe('+ R$ 700,00');
    expect(n(formatarMoedaComSinal(-1850))).toBe('− R$ 18,50');
  });
});

describe('lerValor (o que a pessoa digita → centavos)', () => {
  it.each([
    ['1.234,56', 123456], ['R$ 72', 7200], ['72,5', 7250], ['0,01', 1], ['72,00', 7200],
    ['1234.56', 123456], ['1.234', 123400], ['1.234.567,89', 123456789], [',50', 50], ['R$ 1.234,56', 123456],
  ])('"%s" → %i centavos', (texto, esperado) => {
    expect(lerValor(texto)).toBe(esperado);
  });
  it.each(['', 'abc', '1,2,3', '12,345', '1.2.3.4,5,6', 'R$'])('rejeita "%s"', (texto) => {
    expect(lerValor(texto)).toBeNull();
  });
  it('não sofre com erro de arredondamento (0,1 + 0,2)', () => {
    expect(somar([lerValor('0,10')!, lerValor('0,20')!])).toBe(30);
  });
});

describe('formatarPercentual', () => {
  it('usa vírgula decimal', () => {
    expect(formatarPercentual(19.81)).toBe('19,8%');
    expect(formatarPercentual(107.08, 0)).toBe('107%');
  });
});
