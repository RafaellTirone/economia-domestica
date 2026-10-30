import type { Categoria, Centavos, DataISO, Lancamento } from '../tipos';
import { adicionarDias, formatarData, hojeISO, inicioDaSemana, limitesDoMes, partesDaData } from '../utils/datas';

// Relatórios semanal, mensal e anual + exportação em planilha (CSV que abre no Excel).

const noPeriodo = (l: Lancamento, inicio: DataISO, fim: DataISO) => l.data >= inicio && l.data <= fim;
const soma = (lista: Lancamento[], tipo: Lancamento['tipo']) => lista.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valor, 0);

export interface FatiaCategoria { categoria: Categoria | null; valor: Centavos; percentual: number }

function porCategoria(lista: Lancamento[], categorias: Categoria[]): FatiaCategoria[] {
  const mapa = new Map<number, Centavos>();
  for (const l of lista) if (l.tipo === 'despesa') mapa.set(l.categoriaId, (mapa.get(l.categoriaId) ?? 0) + l.valor);
  const total = [...mapa.values()].reduce((s, v) => s + v, 0);
  return [...mapa.entries()].map(([id, valor]) => ({ categoria: categorias.find((c) => c.id === id) ?? null, valor, percentual: total ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

const variacao = (atual: number, anterior: number): number | null => (anterior ? ((atual - anterior) / anterior) * 100 : null);

// ---------- Semanal (segunda a domingo) ----------

export interface RelatorioSemanal {
  inicio: DataISO; fim: DataISO;
  despesas: Centavos; receitas: Centavos;
  despesasSemanaAnterior: Centavos;
  variacao: number | null;
  porDia: { data: DataISO; valor: Centavos }[];
  categorias: FatiaCategoria[];
  lancamentos: Lancamento[];
}

export function relatorioSemanal(todos: Lancamento[], categorias: Categoria[], qualquerDia: DataISO = hojeISO()): RelatorioSemanal {
  const inicio = inicioDaSemana(qualquerDia);
  const fim = adicionarDias(inicio, 6);
  const lista = todos.filter((l) => noPeriodo(l, inicio, fim));
  const anterior = todos.filter((l) => noPeriodo(l, adicionarDias(inicio, -7), adicionarDias(inicio, -1)));
  const despesas = soma(lista, 'despesa');
  const despesasSemanaAnterior = soma(anterior, 'despesa');
  return {
    inicio, fim, despesas, receitas: soma(lista, 'receita'), despesasSemanaAnterior, variacao: variacao(despesas, despesasSemanaAnterior),
    porDia: Array.from({ length: 7 }, (_, i) => { const d = adicionarDias(inicio, i); return { data: d, valor: soma(lista.filter((l) => l.data === d), 'despesa') }; }),
    categorias: porCategoria(lista, categorias),
    lancamentos: [...lista].sort((a, b) => a.data.localeCompare(b.data)),
  };
}

// ---------- Mensal ----------

export interface RelatorioMensal {
  ano: number; mes: number;
  receitas: Centavos; despesas: Centavos; guardado: Centavos; saldo: Centavos;
  percentualEconomizado: number | null;
  anterior: { receitas: Centavos; despesas: Centavos; saldo: Centavos };
  variacaoDespesas: number | null;
  categorias: FatiaCategoria[];
  /** Categorias com limite: gasto x limite. */
  orcamento: { categoria: Categoria; gasto: Centavos; limite: Centavos; percentual: number }[];
  maioresDespesas: Lancamento[];
  lancamentos: Lancamento[];
}

export function relatorioMensal(todos: Lancamento[], categorias: Categoria[], ano: number, mes: number): RelatorioMensal {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const ant = limitesDoMes(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1);
  const lista = todos.filter((l) => noPeriodo(l, inicio, fim));
  const anteriorLista = todos.filter((l) => noPeriodo(l, ant.inicio, ant.fim));
  const receitas = soma(lista, 'receita'), despesas = soma(lista, 'despesa');
  const anterior = { receitas: soma(anteriorLista, 'receita'), despesas: soma(anteriorLista, 'despesa'), saldo: 0 };
  anterior.saldo = anterior.receitas - anterior.despesas;
  const fatias = porCategoria(lista, categorias);
  return {
    ano, mes, receitas, despesas, guardado: soma(lista, 'guardado'), saldo: receitas - despesas,
    percentualEconomizado: receitas ? ((receitas - despesas) / receitas) * 100 : null,
    anterior, variacaoDespesas: variacao(despesas, anterior.despesas), categorias: fatias,
    orcamento: categorias.filter((c) => c.tipo === 'despesa' && c.limiteMensal).map((c) => {
      const gasto = fatias.find((f) => f.categoria?.id === c.id)?.valor ?? 0;
      return { categoria: c, gasto, limite: c.limiteMensal!, percentual: (gasto / c.limiteMensal!) * 100 };
    }),
    maioresDespesas: lista.filter((l) => l.tipo === 'despesa').sort((a, b) => b.valor - a.valor).slice(0, 5),
    lancamentos: [...lista].sort((a, b) => a.data.localeCompare(b.data)),
  };
}

// ---------- Anual ----------

export interface RelatorioAnual {
  ano: number;
  meses: { mes: number; receitas: Centavos; despesas: Centavos; saldo: Centavos; guardado: Centavos }[];
  receitas: Centavos; despesas: Centavos; economizado: Centavos; guardado: Centavos;
  /** Média de gastos dos meses que já tiveram lançamentos. */
  mediaGastosMes: Centavos;
  mesesComDados: number;
  categorias: FatiaCategoria[];
  maioresDespesas: Lancamento[];
}

export function relatorioAnual(todos: Lancamento[], categorias: Categoria[], ano: number): RelatorioAnual {
  const lista = todos.filter((l) => partesDaData(l.data).ano === ano);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const doMes = lista.filter((l) => partesDaData(l.data).mes === i + 1);
    const receitas = soma(doMes, 'receita'), despesas = soma(doMes, 'despesa');
    return { mes: i + 1, receitas, despesas, saldo: receitas - despesas, guardado: soma(doMes, 'guardado'), tem: doMes.length > 0 };
  });
  const comDados = meses.filter((m) => m.tem);
  const despesas = soma(lista, 'despesa'), receitas = soma(lista, 'receita');
  return {
    ano, meses: meses.map(({ tem: _t, ...m }) => m), receitas, despesas, economizado: receitas - despesas, guardado: soma(lista, 'guardado'),
    mediaGastosMes: comDados.length ? Math.round(comDados.reduce((s, m) => s + m.despesas, 0) / comDados.length) : 0, mesesComDados: comDados.length,
    categorias: porCategoria(lista, categorias),
    maioresDespesas: lista.filter((l) => l.tipo === 'despesa').sort((a, b) => b.valor - a.valor).slice(0, 10),
  };
}

// ---------- Planilha (CSV para Excel) ----------

/**
 * Monta um CSV no padrão do Excel em português: separador ";", vírgula decimal e BOM (acentos certos).
 * Proteção contra "fórmula maliciosa": texto que começa com = + - @ ganha um apóstrofo e não vira fórmula.
 */
export function gerarCsv(linhas: (string | number | null)[][]): string {
  const celula = (v: string | number | null) => {
    if (v === null) return '';
    let t = typeof v === 'number' ? (v / 100).toFixed(2).replace('.', ',') : v;
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t) && !/^-?\d+(,\d+)?$/.test(t)) t = `'${t}`;
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
}

/** Linhas da planilha de lançamentos (valores em centavos viram "1234,56"). */
export function linhasLancamentos(lista: Lancamento[], categorias: Categoria[]): (string | number | null)[][] {
  const nome = new Map(categorias.map((c) => [c.id, c]));
  return [
    ['Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Forma de pagamento', 'Situação', 'Valor (R$)'],
    ...lista.map((l) => {
      const c = nome.get(l.categoriaId);
      return [formatarData(l.data), l.tipo === 'receita' ? 'Receita' : l.tipo === 'despesa' ? 'Despesa' : 'Guardado no cofrinho', l.descricao,
        l.tipo === 'guardado' ? 'Cofrinho' : c?.nome ?? '', c?.subcategorias.find((s) => s.id === l.subcategoriaId)?.nome ?? '',
        { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' }[l.forma], l.situacao === 'pago' ? 'Pago' : 'A pagar', l.valor];
    }),
  ];
}

/** Baixa um arquivo gerado no aparelho. */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
