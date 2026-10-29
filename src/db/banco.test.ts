import { afterEach, describe, expect, it } from 'vitest';
import { BancoFinancas } from './banco';

// Usa um banco de teste (IndexedDB simulado) para conferir a criação e a persistência.
let contador = 0;
const abertos: BancoFinancas[] = [];
function novoBanco(nome = `teste-${++contador}`) {
  const b = new BancoFinancas(nome);
  abertos.push(b);
  return b;
}
afterEach(async () => {
  for (const b of abertos.splice(0)) await b.delete();
});

describe('banco de dados local', () => {
  it('cria as categorias padrão na primeira abertura', async () => {
    const b = novoBanco();
    const cats = await b.categorias.orderBy('ordem').toArray();
    expect(cats.map((c) => c.nome)).toEqual([
      'Moradia', 'Alimentação', 'Transporte', 'Contas da casa', 'Dívidas', 'Saúde', 'Educação', 'Lazer',
      'Casa e higiene', 'Vestuário', 'Outros', 'Salário', 'Renda extra', 'Outras receitas',
    ]);
    expect(cats.filter((c) => c.tipo === 'receita')).toHaveLength(3);
    const alimentacao = cats.find((c) => c.nome === 'Alimentação')!;
    expect(alimentacao.subcategorias.map((s) => s.id)).toContain('compra-do-mes');
    expect(alimentacao.subcategorias.map((s) => s.id)).toContain('delivery');
  });

  it('não duplica as categorias ao abrir de novo (dados persistem)', async () => {
    const nome = `teste-reabrir-${++contador}`;
    const b1 = new BancoFinancas(nome);
    await b1.lancamentos.add({
      tipo: 'despesa', data: '2026-10-28', descricao: 'Padaria', valor: 1850, categoriaId: 2,
      forma: 'debito', fixa: false, situacao: 'pago', criadoEm: '2026-10-28T10:00:00',
    });
    b1.close();
    const b2 = novoBanco(nome);
    expect(await b2.categorias.count()).toBe(14);
    const [l] = await b2.lancamentos.toArray();
    expect(l.valor).toBe(1850);
    expect(l.data).toBe('2026-10-28');
  });

  it('todas as subcategorias têm id único dentro da categoria', async () => {
    const b = novoBanco();
    for (const c of await b.categorias.toArray()) {
      const ids = c.subcategorias.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
