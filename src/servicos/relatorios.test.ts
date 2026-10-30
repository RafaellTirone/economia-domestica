import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from '../db/categoriasPadrao';
import type { Lancamento } from '../tipos';
import { gerarCsv, linhasLancamentos, relatorioAnual, relatorioMensal, relatorioSemanal } from './relatorios';

const categorias = categoriasPadrao().map((c, i) => ({ ...c, id: i + 1 }));
let n = 0;
const L = (data: string, tipo: Lancamento['tipo'], valor: number, categoriaId = 2, descricao = 'x'): Lancamento =>
  ({ id: ++n, data, tipo, valor, categoriaId, descricao, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });

const dados = [
  L('2026-10-19', 'despesa', 100_00, 2), L('2026-10-25', 'despesa', 50_00, 3), // semana anterior (seg 19 a dom 25)
  L('2026-10-26', 'despesa', 72_50, 2), L('2026-10-28', 'despesa', 18_50, 2), L('2026-10-29', 'despesa', 220_00, 3), L('2026-11-01', 'despesa', 9_00, 2),
  L('2026-10-05', 'receita', 6500_00, 12), L('2026-10-05', 'despesa', 1650_00, 1, 'Aluguel'), L('2026-10-06', 'guardado', 500_00, 0),
  L('2026-09-05', 'receita', 6500_00, 12), L('2026-09-05', 'despesa', 1650_00, 1), L('2026-09-10', 'despesa', 3500_00, 2),
];

describe('relatório semanal (segunda a domingo)', () => {
  const r = relatorioSemanal(dados, categorias, '2026-10-29');
  it('período e total da semana', () => {
    expect([r.inicio, r.fim]).toEqual(['2026-10-26', '2026-11-01']);
    expect(r.despesas).toBe(320_00);
  });
  it('compara com a semana anterior', () => {
    expect(r.despesasSemanaAnterior).toBe(150_00);
    expect(r.variacao!.toFixed(1)).toBe('113.3');
  });
  it('gasto por dia e categorias que mais pesaram', () => {
    expect(r.porDia.map((d) => d.valor)).toEqual([72_50, 0, 18_50, 220_00, 0, 0, 9_00]);
    expect(r.categorias[0].categoria!.nome).toBe('Transporte');
    expect(r.categorias[0].valor).toBe(220_00);
  });
});

describe('relatório mensal', () => {
  const r = relatorioMensal(dados, categorias, 2026, 10);
  it('receitas, despesas, saldo e guardado (guardar não é despesa)', () => {
    expect(r.receitas).toBe(6500_00);
    expect(r.despesas).toBe(1650_00 + 72_50 + 18_50 + 220_00 + 100_00 + 50_00);
    expect(r.guardado).toBe(500_00);
    expect(r.saldo).toBe(r.receitas - r.despesas);
  });
  it('compara com o mês anterior', () => {
    expect(r.anterior.despesas).toBe(5150_00);
    expect(r.variacaoDespesas).toBeLessThan(0);
  });
  it('maiores despesas', () => {
    expect(r.maioresDespesas[0].descricao).toBe('Aluguel');
  });
  it('cumprimento do orçamento quando há limite', () => {
    const comLimite = categorias.map((c) => (c.nome === 'Alimentação' ? { ...c, limiteMensal: 150_00 } : c));
    const o = relatorioMensal(dados, comLimite, 2026, 10).orcamento;
    expect(o).toHaveLength(1);
    expect(o[0].gasto).toBe(191_00);
    expect(o[0].percentual.toFixed(0)).toBe('127');
  });
});

describe('relatório anual', () => {
  const r = relatorioAnual(dados, categorias, 2026);
  it('mês a mês, total economizado e média de gastos', () => {
    expect(r.meses).toHaveLength(12);
    expect(r.meses[8].despesas).toBe(5150_00);
    expect(r.economizado).toBe(r.receitas - r.despesas);
    expect(r.mesesComDados).toBe(3);
    expect(r.mediaGastosMes).toBe(Math.round(r.despesas / 3));
    expect(r.maioresDespesas[0].valor).toBe(3500_00);
  });
});

describe('planilha (CSV)', () => {
  it('padrão Excel brasileiro: ; e vírgula decimal, com acentos (BOM)', () => {
    const csv = gerarCsv([['Descrição', 'Valor'], ['Padaria; pão', 1850]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Padaria; pão";18,50');
  });
  it('protege contra fórmulas maliciosas', () => {
    expect(gerarCsv([['=HYPERLINK("http://golpe")']])).toContain(`'=HYPERLINK`);
    expect(gerarCsv([['+5511999']])).toContain("'+5511999");
    expect(gerarCsv([[-1850]])).toContain('-18,50');
  });
  it('linhas de lançamentos com categoria e situação', () => {
    const linhas = linhasLancamentos([dados[6], dados[7]], categorias);
    expect(linhas[0][0]).toBe('Data');
    expect(linhas[2]).toEqual(['05/10/2026', 'Despesa', 'Aluguel', 'Moradia', '', 'Pix', 'Pago', 1650_00]);
  });
});
