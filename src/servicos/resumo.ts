import type { Categoria, Centavos, Lancamento } from '../tipos';

// Cálculos do resumo do mês (usados no Início e, depois, nos relatórios).
// Funções "puras": recebem os dados e devolvem números — fáceis de testar.

export interface ResumoCategoria {
  categoria: Categoria;
  gasto: Centavos;
  /** Percentual do limite usado (null quando não há limite). */
  percentualDoLimite: number | null;
  situacao: 'sem-limite' | 'ok' | 'atencao' | 'estourou';
}

export interface ResumoDoMes {
  receitas: Centavos;
  despesas: Centavos;
  /** Dinheiro enviado para cofrinhos (não conta como despesa). */
  guardado: Centavos;
  /** Receitas − despesas. */
  saldo: Centavos;
  /** O que sobrou livre depois de guardar nos cofrinhos. */
  livre: Centavos;
  /** % da receita que não foi gasta. Null se não houve receita. */
  percentualEconomizado: number | null;
  porCategoria: ResumoCategoria[];
}

/** Situação do orçamento: atenção a partir de 80%, estourou acima de 100%. */
export function situacaoDoLimite(gasto: Centavos, limite: Centavos | null): ResumoCategoria['situacao'] {
  if (!limite) return 'sem-limite';
  const p = (gasto / limite) * 100;
  if (p > 100) return 'estourou';
  if (p >= 80) return 'atencao';
  return 'ok';
}

export function calcularResumo(lancamentos: Lancamento[], categorias: Categoria[]): ResumoDoMes {
  let receitas = 0, despesas = 0, guardado = 0;
  const gastoPorCategoria = new Map<number, Centavos>();

  for (const l of lancamentos) {
    if (l.tipo === 'receita') receitas += l.valor;
    else if (l.tipo === 'guardado') guardado += l.valor;
    else {
      despesas += l.valor;
      gastoPorCategoria.set(l.categoriaId, (gastoPorCategoria.get(l.categoriaId) ?? 0) + l.valor);
    }
  }

  const porCategoria = categorias
    .filter((c) => c.tipo === 'despesa')
    .map((categoria) => {
      const gasto = gastoPorCategoria.get(categoria.id!) ?? 0;
      return {
        categoria,
        gasto,
        percentualDoLimite: categoria.limiteMensal ? (gasto / categoria.limiteMensal) * 100 : null,
        situacao: situacaoDoLimite(gasto, categoria.limiteMensal),
      };
    })
    // Maiores gastos primeiro; empate mantém a ordem da lista de categorias
    .sort((a, b) => b.gasto - a.gasto || a.categoria.ordem - b.categoria.ordem);

  const saldo = receitas - despesas;
  return {
    receitas, despesas, guardado, saldo,
    livre: saldo - guardado,
    percentualEconomizado: receitas > 0 ? (saldo / receitas) * 100 : null,
    porCategoria,
  };
}
