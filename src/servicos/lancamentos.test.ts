import { describe, expect, it } from 'vitest';
import type { Lancamento } from '../tipos';
import {
  descricoesFrequentes, dividirEmParcelas, filtrarLancamentos, montarLancamentos, sugestaoPorDescricao, totais,
  validarLancamento, type DadosLancamento,
} from './lancamentos';
import { categoriasPadrao } from '../db/categoriasPadrao';

const dados = (extra: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: 'despesa', data: '2026-10-29', descricao: 'Delivery', valor: 7200, categoriaId: 2, subcategoriaId: 'delivery',
  forma: 'credito', fixa: false, situacao: 'pago', parcelas: 1, ...extra,
});

describe('validação', () => {
  it('aceita um lançamento normal', () => expect(validarLancamento(dados())).toEqual({}));
  it('exige valor e categoria', () => {
    const e = validarLancamento(dados({ valor: 0, categoriaId: null }));
    expect(e.valor).toBeTruthy();
    expect(e.categoriaId).toBeTruthy();
  });
  it('rejeita data inválida e textos longos demais', () => {
    expect(validarLancamento(dados({ data: '29/10/2026' })).data).toBeTruthy();
    expect(validarLancamento(dados({ descricao: 'x'.repeat(81) })).descricao).toBeTruthy();
  });
  it('parcelamento só para despesa no crédito', () => {
    expect(validarLancamento(dados({ parcelas: 3, forma: 'pix' })).parcelas).toBeTruthy();
    expect(validarLancamento(dados({ parcelas: 3, tipo: 'receita' })).parcelas).toBeTruthy();
    expect(validarLancamento(dados({ parcelas: 3 }))).toEqual({});
  });
});

describe('parcelado no cartão: cada parcela no mês dela', () => {
  it('não perde centavos ao dividir', () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirEmParcelas(150000, 10).every((v) => v === 15000)).toBe(true);
    expect(dividirEmParcelas(1, 2)).toEqual([1, 0]);
  });
  it('gera uma parcela por mês, mantendo o dia da compra (31 → último dia nos meses curtos)', () => {
    const lista = montarLancamentos(dados({ data: '2026-12-31', valor: 30000, parcelas: 3 }), new Date(2026, 11, 31, 12));
    expect(lista.map((l) => l.data)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
    expect(lista.map((l) => l.parcela!.numero)).toEqual([1, 2, 3]);
    expect(new Set(lista.map((l) => l.parcela!.grupoId)).size).toBe(1);
    expect(lista.reduce((s, l) => s + l.valor, 0)).toBe(30000);
    expect(lista.map((l) => l.situacao)).toEqual(['pago', 'a_pagar', 'a_pagar']);
  });
  it('à vista gera um único lançamento sem parcela', () => {
    const [l, ...resto] = montarLancamentos(dados());
    expect(resto).toHaveLength(0);
    expect(l.parcela).toBeUndefined();
    expect(l.valor).toBe(7200);
  });
  it('receita nunca fica marcada como fixa de despesa', () => {
    const [l] = montarLancamentos(dados({ tipo: 'receita', fixa: true, forma: 'pix' }));
    expect(l.fixa).toBe(false);
  });
});

const L = (id: number, data: string, descricao: string, tipo: Lancamento['tipo'], valor: number, categoriaId: number, subcategoriaId?: string): Lancamento =>
  ({ id, data, descricao, tipo, valor, categoriaId, subcategoriaId, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });

const categorias = categoriasPadrao().map((c, i) => ({ ...c, id: i + 1 }));
const lista = [
  L(1, '2026-10-28', 'Padaria', 'despesa', 1850, 2, 'padaria'),
  L(2, '2026-10-25', 'Freela de design', 'receita', 70000, 13),
  L(3, '2026-10-05', 'Aluguel', 'despesa', 120000, 1),
  L(4, '2026-09-30', 'Padaria', 'despesa', 1500, 2, 'padaria'),
  L(5, '2026-10-12', 'Açougue do Zé', 'despesa', 8900, 2, 'acougue'),
];
const outubro = { inicio: '2026-10-01', fim: '2026-10-31', tipo: 'todos' as const, categoriaId: null, busca: '' };

describe('busca e filtros', () => {
  it('filtra por período e ordena do mais recente', () => {
    expect(filtrarLancamentos(lista, outubro).map((l) => l.id)).toEqual([1, 2, 5, 3]);
  });
  it('filtra por tipo e categoria', () => {
    expect(filtrarLancamentos(lista, { ...outubro, tipo: 'receita' }).map((l) => l.id)).toEqual([2]);
    expect(filtrarLancamentos(lista, { ...outubro, categoriaId: 2 }).map((l) => l.id)).toEqual([1, 5]);
  });
  it('busca ignora acentos e maiúsculas e procura na categoria/subcategoria', () => {
    expect(filtrarLancamentos(lista, { ...outubro, busca: 'acougue' }, categorias).map((l) => l.id)).toEqual([5]);
    expect(filtrarLancamentos(lista, { ...outubro, busca: 'MORADIA' }, categorias).map((l) => l.id)).toEqual([3]);
  });
  it('soma os totais', () => {
    expect(totais(filtrarLancamentos(lista, outubro))).toEqual({ receitas: 70000, despesas: 130750, guardado: 0 });
  });
});

describe('sugestões', () => {
  it('sugere a categoria usada da última vez para a mesma descrição', () => {
    expect(sugestaoPorDescricao('padaria', lista)).toMatchObject({ categoriaId: 2, subcategoriaId: 'padaria' });
    expect(sugestaoPorDescricao('PADÁRIA ', lista)).toMatchObject({ categoriaId: 2 });
    expect(sugestaoPorDescricao('Mercado', lista)).toBeNull();
  });
  it('lista as descrições mais usadas primeiro', () => {
    expect(descricoesFrequentes(lista)[0]).toBe('Padaria');
  });
});
