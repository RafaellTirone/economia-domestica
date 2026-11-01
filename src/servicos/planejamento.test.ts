import { describe, expect, it } from 'vitest';
import type { Desejo, Lancamento } from '../tipos';
import { analisarDesejo, juntarEm, mediaMensal, ordenarDesejos, sobraComCenario } from './planejamento';

const L = (data: string, tipo: Lancamento['tipo'], valor: number, categoriaId = 2): Lancamento =>
  ({ data, tipo, valor, categoriaId, descricao: '', forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });

// Últimos 3 meses (jul, ago, set) — outubro (mês atual) fica de fora
const historico = [
  L('2026-07-05', 'receita', 6500_00), L('2026-07-10', 'despesa', 5390_00),
  L('2026-08-05', 'receita', 6500_00), L('2026-08-10', 'despesa', 5150_00),
  L('2026-09-05', 'receita', 6500_00), L('2026-09-10', 'despesa', 5212_40),
  L('2026-10-05', 'receita', 9999_00), L('2026-09-15', 'guardado', 500_00),
];

describe('estimativa de poupança', () => {
  it('média dos últimos 3 meses completos', () => {
    const m = mediaMensal(historico, '2026-10-30');
    expect(m.meses).toBe(3);
    expect(m.receitas).toBe(6500_00);
    expect(m.despesas).toBe(5250_80);
    expect(m.sobra).toBe(1249_20);
  });
  it('projeção: parado e rendendo', () => {
    expect(juntarEm(1249_20, 6)).toBe(7495_20);
    expect(juntarEm(1249_20, 12)).toBe(14990_40);
    expect(juntarEm(1000_00, 12, 1)).toBe(12682_50); // 1% ao mês
    expect(juntarEm(0, 12, 1)).toBe(0);
  });
  it('cenário: cortar 20% de uma categoria e renda extra', () => {
    const m = mediaMensal(historico, '2026-10-30');
    expect(sobraComCenario(m, { categoriaId: 2, percentual: 20 }, 0)).toBe(1249_20 + 1050_16);
    expect(sobraComCenario(m, { categoriaId: null, percentual: 0 }, 500_00)).toBe(1749_20);
  });
  it('sem histórico: usa o mês atual', () => {
    expect(mediaMensal([L('2026-10-05', 'receita', 3000_00)], '2026-10-30').receitas).toBe(3000_00);
  });
});

const viagem: Desejo = { id: 1, nome: 'Viagem Porto Seguro', precoVista: 4000_00, parcelas: 10, valorParcela: 450_00, prioridade: 'alta', guardarPorMes: 500_00, quando: null, cofrinhoId: null, comprado: false, criadoEm: '' };

describe('intenção de compra', () => {
  const media = mediaMensal(historico, '2026-10-30');
  it('à vista x parcelado e em quanto tempo junta', () => {
    const a = analisarDesejo(viagem, media, 0, '2026-10-30');
    expect(a.aMaisParcelando).toBe(500_00);
    expect(a.totalParcelado).toBe(4500_00);
    expect(a.meses).toBe(8);
    expect(a.quando).toEqual({ ano: 2027, mes: 6 });
    expect(a.cabe).toBe('folgado');
    expect(a.pesoParcelaNaRenda!.toFixed(1)).toBe('6.9');
  });
  it('desconta o que já está no cofrinho', () => {
    expect(analisarDesejo(viagem, media, 1150_00, '2026-10-30').meses).toBe(6); // falta 2.850
  });
  it('com data: quanto guardar por mês', () => {
    const a = analisarDesejo({ ...viagem, guardarPorMes: null, quando: '2026-12-15' }, media, 0, '2026-10-30');
    expect(a.precisaPorMes).toBe(2000_00);
    expect(a.cabe).toBe('nao-cabe');
  });
  it('ordem sugerida: prioridade, data, preço', () => {
    const tv = { ...viagem, id: 2, nome: 'TV', prioridade: 'media' as const, precoVista: 2500_00 };
    const sofa = { ...viagem, id: 3, nome: 'Sofá', prioridade: 'alta' as const, precoVista: 3000_00, quando: '2027-01-01' };
    expect(ordenarDesejos([tv, viagem, sofa]).map((d) => d.nome)).toEqual(['Sofá', 'Viagem Porto Seguro', 'TV']);
  });
});
