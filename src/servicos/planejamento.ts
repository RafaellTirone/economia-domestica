import type { Centavos, DataISO, Desejo, Lancamento } from '../tipos';
import { adicionarMeses, hojeISO, limitesDoMes, partesDaData } from '../utils/datas';

// Planejamento: estimativa de poupança (com rendimento e cenários) e intenção de compra (desejos).

export interface MediaMensal {
  receitas: Centavos;
  despesas: Centavos;
  sobra: Centavos;
  /** Quantos meses entraram na média. */
  meses: number;
  porCategoria: Map<number, Centavos>;
}

/**
 * Média dos últimos 3 meses completos (mais realista que olhar só o mês atual).
 * Sem histórico, usa o mês atual.
 */
export function mediaMensal(lancamentos: Lancamento[], hoje: DataISO = hojeISO(), quantos = 3): MediaMensal {
  const { ano, mes } = partesDaData(hoje);
  const meses: { inicio: DataISO; fim: DataISO }[] = [];
  for (let k = quantos; k >= 1; k--) {
    const p = partesDaData(adicionarMeses(`${ano}-${String(mes).padStart(2, '0')}-01`, -k));
    meses.push(limitesDoMes(p.ano, p.mes));
  }
  let usados = meses.filter((m) => lancamentos.some((l) => l.data >= m.inicio && l.data <= m.fim));
  if (usados.length === 0) usados = [limitesDoMes(ano, mes)];
  const dentro = (l: Lancamento) => usados.some((m) => l.data >= m.inicio && l.data <= m.fim);
  let receitas = 0, despesas = 0;
  const porCategoria = new Map<number, Centavos>();
  for (const l of lancamentos.filter(dentro)) {
    if (l.tipo === 'receita') receitas += l.valor;
    else if (l.tipo === 'despesa') { despesas += l.valor; porCategoria.set(l.categoriaId, (porCategoria.get(l.categoriaId) ?? 0) + l.valor); }
  }
  const n = usados.length;
  for (const [k, v] of porCategoria) porCategoria.set(k, Math.round(v / n));
  return { receitas: Math.round(receitas / n), despesas: Math.round(despesas / n), sobra: Math.round((receitas - despesas) / n), meses: n, porCategoria };
}

/** Quanto junta guardando um valor todo mês, com ou sem rendimento (juros compostos, depósito no fim do mês). */
export function juntarEm(porMes: Centavos, meses: number, taxaMensal = 0): Centavos {
  if (porMes <= 0) return 0;
  const i = taxaMensal / 100;
  if (i === 0) return porMes * meses;
  return Math.round(porMes * (((1 + i) ** meses - 1) / i));
}

export const HORIZONTES = [
  { meses: 1, nome: '1 mês' }, { meses: 6, nome: '6 meses (semestre)' }, { meses: 12, nome: '1 ano' }, { meses: 60, nome: '5 anos' },
] as const;

/** Cenário "e se…": cortar uma % de uma categoria e/ou ganhar uma renda extra. */
export function sobraComCenario(media: MediaMensal, corte: { categoriaId: number | null; percentual: number }, rendaExtra: Centavos): Centavos {
  const gastoCategoria = corte.categoriaId ? media.porCategoria.get(corte.categoriaId) ?? 0 : 0;
  return media.sobra + Math.round((gastoCategoria * corte.percentual) / 100) + rendaExtra;
}

// ---------- Desejos ----------

export interface AnaliseDesejo {
  desejo: Desejo;
  /** Quanto paga a mais parcelando (0 se não houver parcelamento). */
  aMaisParcelando: Centavos;
  totalParcelado: Centavos | null;
  /** Já guardado no cofrinho ligado ao desejo. */
  jaGuardado: Centavos;
  falta: Centavos;
  /** Meses para juntar guardando o valor escolhido (null = sem valor por mês). */
  meses: number | null;
  quando: { ano: number; mes: number } | null;
  /** Para comprar até a data desejada: quanto guardar por mês. */
  precisaPorMes: Centavos | null;
  /** Cabe no que sobra por mês? */
  cabe: 'folgado' | 'apertado' | 'nao-cabe' | null;
  /** Peso da parcela na renda média (%). */
  pesoParcelaNaRenda: number | null;
}

export function analisarDesejo(d: Desejo, media: MediaMensal | null, jaGuardado: Centavos, hoje: DataISO = hojeISO()): AnaliseDesejo {
  const totalParcelado = d.parcelas && d.valorParcela ? d.parcelas * d.valorParcela : null;
  const falta = Math.max(0, d.precoVista - jaGuardado);
  const porMes = d.guardarPorMes ?? 0;
  const meses = porMes > 0 ? Math.ceil(falta / porMes) : null;
  const alvo = meses !== null ? partesDaData(adicionarMeses(hoje, meses)) : null;
  let precisaPorMes: Centavos | null = null;
  if (d.quando) {
    const h = partesDaData(hoje), q = partesDaData(d.quando);
    precisaPorMes = Math.ceil(falta / Math.max(1, (q.ano - h.ano) * 12 + (q.mes - h.mes)));
  }
  const referencia = porMes || precisaPorMes || 0;
  const cabe = !media || referencia === 0 ? null : referencia <= media.sobra * 0.5 ? 'folgado' : referencia <= media.sobra ? 'apertado' : 'nao-cabe';
  return {
    desejo: d, totalParcelado, aMaisParcelando: totalParcelado ? Math.max(0, totalParcelado - d.precoVista) : 0, jaGuardado, falta, meses,
    quando: alvo ? { ano: alvo.ano, mes: alvo.mes } : null, precisaPorMes, cabe,
    pesoParcelaNaRenda: d.valorParcela && media && media.receitas > 0 ? (d.valorParcela / media.receitas) * 100 : null,
  };
}

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };
/** Ordem sugerida: prioridade, depois o que tem data mais próxima, depois o mais barato. */
export function ordenarDesejos(lista: Desejo[]): Desejo[] {
  return [...lista].sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]
    || (a.quando ?? '9999').localeCompare(b.quando ?? '9999') || a.precoVista - b.precoVista);
}
