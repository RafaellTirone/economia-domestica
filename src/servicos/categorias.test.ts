import { beforeEach, describe, expect, it } from 'vitest';
import { banco } from '../db/banco';
import { excluirCategoria, salvarCategoria, validarCategoria } from './categorias';
import { alertaOrcamento } from './orcamento';

beforeEach(async () => { await banco.delete(); await banco.open(); });

describe('categorias', () => {
  it('cria e edita mantendo os ids das subcategorias', async () => {
    const id = await salvarCategoria({ nome: 'Pet', tipo: 'despesa', cor: '#a0522d', icone: 'pet', subcategorias: ['Ração', 'Veterinário'], limiteMensal: 30000 });
    const antes = (await banco.categorias.get(id))!;
    expect(antes.subcategorias.map((s) => s.id)).toEqual(['racao', 'veterinario']);
    await salvarCategoria({ nome: 'Pets', tipo: 'despesa', cor: '#a0522d', icone: 'pet', subcategorias: ['Ração', 'Banho e tosa'], limiteMensal: 40000 }, id);
    const depois = (await banco.categorias.get(id))!;
    expect(depois.nome).toBe('Pets');
    expect(depois.subcategorias).toEqual([{ id: 'racao', nome: 'Ração' }, { id: 'banho-e-tosa', nome: 'Banho e tosa' }]);
    expect(depois.limiteMensal).toBe(40000);
  });
  it('não deixa nome repetido nem vazio', async () => {
    const todas = await banco.categorias.toArray();
    expect(validarCategoria({ nome: 'alimentação', tipo: 'despesa', cor: '#000000', icone: 'caixa', subcategorias: [], limiteMensal: null }, todas)).toHaveProperty('nome');
    expect(validarCategoria({ nome: '  ', tipo: 'despesa', cor: '#000000', icone: 'caixa', subcategorias: [], limiteMensal: null }, todas)).toHaveProperty('nome');
    expect(validarCategoria({ nome: 'Alimentação', tipo: 'receita', cor: '#000000', icone: 'caixa', subcategorias: [], limiteMensal: null }, todas)).toEqual({});
  });
  it('excluir com lançamentos exige mover e move', async () => {
    await banco.lancamentos.add({ tipo: 'despesa', data: '2026-10-01', descricao: 'x', valor: 100, categoriaId: 10, subcategoriaId: 'roupas', forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });
    await expect(excluirCategoria(10, null)).rejects.toThrow(/mover/);
    await excluirCategoria(10, 11);
    const l = (await banco.lancamentos.toArray())[0];
    expect(l.categoriaId).toBe(11);
    expect(l.subcategoriaId).toBeUndefined();
    expect(await banco.categorias.get(10)).toBeUndefined();
  });
});

describe('alerta de orçamento', () => {
  it('avisa ao passar de 80% e de 100%', () => {
    expect(alertaOrcamento('Alimentação', 1000_00, 700_00, 850_00)).toBe('Atenção: Alimentação chegou a 85% do limite do mês.');
    expect(alertaOrcamento('Alimentação', 1000_00, 900_00, 1070_00)).toBe('Atenção: Alimentação passou do limite do mês (107%).');
    expect(alertaOrcamento('Alimentação', 1000_00, 850_00, 900_00)).toBeNull(); // já tinha passado de 80%
    expect(alertaOrcamento('Alimentação', null, 0, 99999_00)).toBeNull();
  });
});
