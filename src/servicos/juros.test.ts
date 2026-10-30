import { describe, expect, it } from 'vitest';
import { converterTaxa, encargosDeAtraso, parcelaPrice, saldoDevedor, tabelaDeParcelas, taxaImplicita } from './juros';

// Valores conferidos à mão (os mesmos dos layouts aprovados).
describe('taxas', () => {
  it('converte mês ↔ ano ↔ dia (juros compostos)', () => {
    expect(converterTaxa(1.89, 'mes', 'ano').toFixed(2)).toBe('25.19');
    expect(converterTaxa(1, 'mes', 'ano').toFixed(2)).toBe('12.68');
    expect(converterTaxa(1.89, 'mes', 'dia').toFixed(3)).toBe('0.062');
    expect(converterTaxa(12.68, 'ano', 'mes').toFixed(2)).toBe('1.00');
  });
});

describe('Tabela Price', () => {
  it('calcula a parcela', () => {
    expect(parcelaPrice(1000_00, 1, 10)).toBe(105_58);
    expect(parcelaPrice(10000_00, 1.89, 36)).toBe(385_43);
    expect(parcelaPrice(1200_00, 0, 12)).toBe(100_00);
  });
  it('separa juros e amortização e zera o saldo no fim', () => {
    const t = tabelaDeParcelas(10000_00, 1.89, 36);
    expect(t[7].juros).toBe(161_49); // parcela 8
    expect(t[7].amortizacao).toBe(223_94);
    expect(t[35].saldoDepois).toBe(0);
    expect(t.reduce((s, l) => s + l.amortizacao, 0)).toBe(10000_00);
  });
  it('SAC: amortização constante, parcelas caindo', () => {
    const t = tabelaDeParcelas(1200_00, 1, 12, 'sac');
    expect(t[0].amortizacao).toBe(100_00);
    expect(t[0].parcela).toBe(112_00);
    expect(t[11].parcela).toBe(101_00);
    expect(t[11].saldoDepois).toBe(0);
  });
  it('saldo devedor para quitar hoje', () => {
    expect(saldoDevedor(385_43, 1.89, 29)).toBe(8544_48); // com a parcela real do contrato (R$ 385,43)
    expect(saldoDevedor(105_58, 1, 6)).toBe(611_89);
  });
  it('descobre a taxa pelas parcelas', () => {
    expect(taxaImplicita(10000_00, 385_43, 36)!.toFixed(2)).toBe('1.89');
    expect(taxaImplicita(1000_00, 105_58, 10)!.toFixed(2)).toBe('1.00');
    expect(taxaImplicita(1200_00, 100_00, 12)).toBe(0);
  });
});

describe('atraso', () => {
  it('multa uma vez + mora por dia (pro rata)', () => {
    expect(encargosDeAtraso(105_58, 4, 2, 1, 'mes')).toMatchObject({ multa: 2_11, mora: 14, total: 107_83, moraPorDia: 4 });
    expect(encargosDeAtraso(105_58, 15, 2, 1, 'mes').total).toBe(108_22);
    expect(encargosDeAtraso(105_58, 30, 2, 1, 'mes').total).toBe(108_75);
  });
  it('em dia não tem encargo', () => {
    expect(encargosDeAtraso(105_58, 0, 2, 1, 'mes').total).toBe(105_58);
  });
  it('mora informada ao dia', () => {
    expect(encargosDeAtraso(100_00, 10, 0, 0.033, 'dia').mora).toBe(33);
  });
});
