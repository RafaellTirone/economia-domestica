import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from '../db/categoriasPadrao';
import type { Lancamento } from '../tipos';
import { calcularResumo, situacaoDoLimite } from './resumo';

const categorias = categoriasPadrao().map((c, i) => ({ ...c, id: i + 1 })); // 1 Moradia, 2 Alimentação …
const base = { forma: 'pix' as const, fixa: false, situacao: 'pago' as const, criadoEm: '2026-10-01T00:00:00' };
const l = (tipo: Lancamento['tipo'], valor: number, categoriaId: number): Lancamento =>
  ({ ...base, tipo, valor, categoriaId, data: '2026-10-10', descricao: 'x' });

describe('resumo do mês', () => {
  it('guardar no cofrinho NÃO conta como despesa', () => {
    const r = calcularResumo([l('receita', 650000, 12), l('despesa', 521240, 1), l('guardado', 80000, 1)], categorias);
    expect(r.receitas).toBe(650000);
    expect(r.despesas).toBe(521240);
    expect(r.guardado).toBe(80000);
    expect(r.saldo).toBe(128760);
    expect(r.livre).toBe(48760);
    expect(r.percentualEconomizado!.toFixed(1)).toBe('19.8');
  });
  it('soma por categoria e ordena do maior para o menor', () => {
    const r = calcularResumo([l('despesa', 1850, 2), l('despesa', 165000, 1), l('despesa', 7200, 2)], categorias);
    expect(r.porCategoria[0].categoria.nome).toBe('Moradia');
    expect(r.porCategoria[1].gasto).toBe(9050);
    expect(r.porCategoria).toHaveLength(11); // só categorias de despesa
  });
  it('mês vazio não quebra', () => {
    const r = calcularResumo([], categorias);
    expect(r.saldo).toBe(0);
    expect(r.percentualEconomizado).toBeNull();
  });
  it('alertas de orçamento em 80% e 100%', () => {
    expect(situacaoDoLimite(79_99, 100_00)).toBe('ok');
    expect(situacaoDoLimite(80_00, 100_00)).toBe('atencao');
    expect(situacaoDoLimite(100_00, 100_00)).toBe('atencao');
    expect(situacaoDoLimite(100_01, 100_00)).toBe('estourou');
    expect(situacaoDoLimite(500, null)).toBe('sem-limite');
  });
});
