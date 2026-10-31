import { banco } from '../db/banco';
import type { Centavos, DataISO } from '../tipos';
import { formatarPercentual } from '../utils/moeda';

// Orçamento: aviso quando um gasto faz a categoria passar de 80% ou de 100% do limite do mês.

export function alertaOrcamento(nomeCategoria: string, limite: Centavos | null, gastoAntes: Centavos, gastoDepois: Centavos): string | null {
  if (!limite || limite <= 0) return null;
  const antes = (gastoAntes / limite) * 100;
  const depois = (gastoDepois / limite) * 100;
  if (depois > 100 && antes <= 100) return `Atenção: ${nomeCategoria} passou do limite do mês (${formatarPercentual(depois, 0)}).`;
  if (depois >= 80 && antes < 80) return `Atenção: ${nomeCategoria} chegou a ${formatarPercentual(depois, 0)} do limite do mês.`;
  return null;
}

/** Quanto já foi gasto numa categoria no mês da data informada (todas as despesas, pagas ou a pagar). */
export async function gastoDaCategoriaNoMes(categoriaId: number, data: DataISO): Promise<Centavos> {
  const mes = data.slice(0, 7);
  const lista = await banco.lancamentos.where('[tipo+data]').between(['despesa', `${mes}-01`], ['despesa', `${mes}-31`], true, true).toArray();
  return lista.filter((l) => l.categoriaId === categoriaId).reduce((t, l) => t + l.valor, 0);
}
