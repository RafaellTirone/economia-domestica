import { beforeEach, describe, expect, it } from 'vitest';
import { banco } from '../db/banco';
import { apagarExemplos, apagarTudo, carregarExemplos } from './exemplos';

beforeEach(async () => { await banco.delete(); await banco.open(); });
const hoje = '2026-10-20';

describe('dados de exemplo', () => {
  it('carrega 4 meses de uso e apaga só os exemplos, sem tocar no que é da pessoa', async () => {
    const meu = await banco.lancamentos.add({ tipo: 'despesa', data: '2026-10-02', descricao: 'Meu gasto', valor: 1234, categoriaId: 2, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' });
    await banco.categorias.update(8, { limiteMensal: 50000 }); // Lazer: limite da pessoa
    await carregarExemplos(hoje);
    const lancs = await banco.lancamentos.toArray();
    expect(lancs.filter((l) => l.exemplo).length).toBeGreaterThan(50);
    expect(new Set(lancs.map((l) => l.data.slice(0, 7)))).toEqual(new Set(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']));
    expect(lancs.some((l) => l.data > hoje && l.situacao === 'pago' && !l.parcela && l.tipo === 'despesa')).toBe(false);
    expect(lancs.find((l) => l.descricao === 'Luz' && l.data === '2026-10-15')?.situacao).toBe('a_pagar');
    expect(lancs.find((l) => l.descricao === 'Aluguel' && l.data === '2026-10-10')?.situacao).toBe('pago');
    expect(await banco.pagamentosParcela.count()).toBe(4);
    expect(await banco.movimentosCofrinho.count()).toBe(4);
    expect((await banco.categorias.get(2))!.limiteMensal).toBe(120000);
    expect((await banco.categorias.get(8))!.limiteMensal).toBe(50000);

    await apagarExemplos();
    expect((await banco.lancamentos.toArray()).map((l) => l.id)).toEqual([meu]);
    for (const t of ['recorrencias', 'emprestimos', 'pagamentosParcela', 'cofrinhos', 'movimentosCofrinho', 'desejos'] as const) expect(await banco[t].count()).toBe(0);
    expect((await banco.categorias.get(2))!.limiteMensal).toBeNull();
    expect((await banco.categorias.get(8))!.limiteMensal).toBe(50000);
  });

  it('apagar tudo deixa só as categorias padrão', async () => {
    await carregarExemplos(hoje);
    await banco.configuracoes.put({ chave: 'pix-reserva', valor: 'x' });
    await apagarTudo();
    expect(await banco.lancamentos.count()).toBe(0);
    expect(await banco.configuracoes.count()).toBe(0);
    expect(await banco.categorias.count()).toBe(14);
    expect((await banco.categorias.toArray()).every((c) => c.limiteMensal === null)).toBe(true);
  });
});
