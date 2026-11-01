import { describe, expect, it } from 'vitest';
import { calcular, emCentavos } from './calculadora';

describe('calculadora', () => {
  it('soma itens de compra com vírgula', () => {
    expect(calcular('32,90 + 18,45 + 7,50')).toBeCloseTo(58.85);
    expect(emCentavos(calcular('32,90 + 18,45 + 7,50')!)).toBe(5885);
  });
  it('× e ÷ antes de + e −, como no celular', () => {
    expect(calcular('2 + 3 × 4')).toBe(14);
    expect(calcular('1,5 × 39,90')).toBeCloseTo(59.85);
    expect(calcular('100 ÷ 4 − 5')).toBe(20);
  });
  it('quilo: 1,250 kg de carne a R$ 42,90', () => {
    expect(emCentavos(calcular('1,250 × 42,90')!)).toBe(5363);
  });
  it('porcentagem como no celular', () => {
    expect(calcular('100 + 10%')).toBe(110);
    expect(calcular('200 − 15%')).toBe(170);
    expect(calcular('200 × 10%')).toBe(20);
    expect(calcular('50%')).toBe(0.5);
  });
  it('operação sobrando no fim é ignorada e negativo no começo funciona', () => {
    expect(calcular('10 + 5 +')).toBe(15);
    expect(calcular('− 5 + 8')).toBe(3);
  });
  it('dividir por zero e lixo dão null', () => {
    expect(calcular('5 ÷ 0')).toBeNull();
    expect(calcular('')).toBeNull();
    expect(calcular('abc')).toBeNull();
    expect(calcular('5 + + 3')).toBeNull();
  });
  it('arredonda centavos sem erro de ponto flutuante', () => {
    expect(emCentavos(0.1 + 0.2)).toBe(30);
    expect(emCentavos(1.005)).toBe(101);
  });
});
