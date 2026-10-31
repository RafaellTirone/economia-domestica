import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from '../db/categoriasPadrao';
import type { Categoria, Lancamento } from '../tipos';
import { itensDeAtencao, paraOndeFoi } from './atencao';

const categorias: Categoria[] = categoriasPadrao().map((c, i) => ({ ...c, id: i + 1 }));
categorias[1].limiteMensal = 100000; // Alimentação: R$ 1.000,00
const l = (p: Partial<Lancamento>): Lancamento => ({ tipo: 'despesa', data: '2026-10-10', descricao: '', valor: 1000, categoriaId: 2, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '', ...p });
const hoje = '2026-10-20';

describe('precisa da sua atenção', () => {
  it('nada para mostrar quando está tudo em dia', () => {
    expect(itensDeAtencao({ hoje, lancamentos: [], categorias, emprestimos: [], ultimoBackup: null })).toEqual([]);
  });

  it('contas atrasadas, vencendo na semana, orçamento e backup, em ordem de gravidade', () => {
    const itens = itensDeAtencao({
      hoje, categorias, emprestimos: [], ultimoBackup: '2026-10-01T12:00:00Z',
      lancamentos: [
        l({ descricao: 'Luz', valor: 18740, data: '2026-10-15', situacao: 'a_pagar', categoriaId: 4 }),
        l({ descricao: 'Internet', valor: 9990, data: '2026-10-20', situacao: 'a_pagar', categoriaId: 4 }),
        l({ descricao: 'Água', valor: 8000, data: '2026-10-25', situacao: 'a_pagar', categoriaId: 4 }),
        l({ descricao: 'Condomínio', valor: 50000, data: '2026-10-28', situacao: 'a_pagar', categoriaId: 1 }),
        l({ descricao: 'TV 3/10', valor: 20000, data: '2026-10-05', situacao: 'a_pagar', categoriaId: 8, parcela: { numero: 3, total: 10, grupoId: 'x' } }),
        l({ descricao: 'Mercado', valor: 85000 }),
      ],
    });
    const nb = (t: string) => t.replace(/\u00a0/g, ' ');
    expect(itens.map((i) => [i.nivel, nb(i.texto)])).toEqual([
      ['perigo', 'Conta atrasada: Luz (R$ 187,40), venceu em 15/10/2026.'],
      ['alerta', '2 contas vencem nos próximos 7 dias, somando R$ 179,90 (1 hoje).'],
      ['alerta', 'Alimentação já usou 85% do limite do mês (restam R$ 150,00).'],
      ['info', 'Sua última cópia de segurança foi há 19 dias. Que tal fazer outra?'],
    ]);
    expect(itens[0].texto).toContain('Luz');
    expect(itens[1].texto).toContain('2 contas vencem nos próximos 7 dias');
    expect(itens[1].texto).toContain('(1 hoje)');
  });

  it('parcela de empréstimo atrasada e vencendo; consignado descontado do salário não avisa', () => {
    const base = { emprestimo: { id: 7, nome: 'Carro' }, atrasadas: [], proxima: { numero: 4, valor: 50000, vencimentoUtil: '2026-10-22' } };
    const itens = itensDeAtencao({ hoje, categorias, lancamentos: [], ultimoBackup: null, emprestimos: [
      base,
      { ...base, emprestimo: { id: 8, nome: 'Pessoal' }, atrasadas: [{}, {}] },
      { ...base, emprestimo: { id: 9, nome: 'Consignado' }, proxima: { ...base.proxima, descontadaDoSalario: true } },
    ] as never });
    expect(itens.map((i) => i.texto)).toEqual([
      expect.stringContaining('Pessoal: 2 parcelas atrasadas'),
      expect.stringContaining('Parcela 4 de Carro'),
      expect.stringContaining('ainda não fez uma cópia de segurança'),
    ]);
    expect(itens[1].texto).toContain('vence em 2 dias');
    expect(itens[1].link).toBe('/dividas/7');
  });

  it('para onde foi: maiores categorias, guardado e sobra; ou quanto passou', () => {
    const mes = [
      l({ tipo: 'receita', valor: 500000, categoriaId: 12 }),
      l({ valor: 150000, categoriaId: 1 }), l({ valor: 90000, categoriaId: 2 }),
      l({ tipo: 'guardado', valor: 50000, categoriaId: 0 }),
    ];
    const r = paraOndeFoi(mes, categorias);
    expect(r.fatias.map((f) => [f.rotulo, f.valor])).toEqual([['Moradia', 150000], ['Alimentação', 90000], ['Guardado nos cofrinhos', 50000], ['Sobrou', 210000]]);
    expect(r).toMatchObject({ base: 500000, passou: 0 });
    const r2 = paraOndeFoi([l({ tipo: 'receita', valor: 100000, categoriaId: 12 }), l({ valor: 130000, categoriaId: 1 })], categorias);
    expect(r2).toMatchObject({ base: 130000, passou: 30000 });
  });
});
