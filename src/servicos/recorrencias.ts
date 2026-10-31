import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
import type { DataISO, Lancamento, Recorrencia } from '../tipos';
import { diasNoMes, hojeISO, montarData } from '../utils/datas';
import { montarLancamentos, type DadosLancamento } from './lancamentos';

// Contas que se repetem todo mês (aluguel, luz, internet, salário…).
// A repetição guarda o "molde"; cada mês vira um lançamento normal, ligado pelo recorrenciaId.
// Gera sempre até o mês que vem, para as contas do começo do mês aparecerem a tempo.

/** 'AAAA-MM' de uma data. */
export const mesDe = (d: DataISO) => d.slice(0, 7);

/** Soma meses a um 'AAAA-MM'. */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Data da conta no mês: o dia escolhido, ou o último dia em meses mais curtos (ex.: 31 → 30/04). */
export function dataNoMes(mes: string, dia: number): DataISO {
  const [a, m] = mes.split('-').map(Number);
  return montarData(a, m, Math.min(dia, diasNoMes(a, m)));
}

/** Meses em que a repetição vale, de 'inicio' até 'ate' (sem os pulados e sem passar do fim). */
export function mesesDaRecorrencia(r: Recorrencia, ate: string, desde = r.inicio): string[] {
  const meses: string[] = [];
  const ultimo = r.fim && r.fim < ate ? r.fim : ate;
  for (let m = desde < r.inicio ? r.inicio : desde; m <= ultimo; m = somarMeses(m, 1)) {
    if (!r.pulados.includes(m)) meses.push(m);
  }
  return meses;
}

/** Monta o lançamento de um mês. Receita do passado já conta como recebida; conta a pagar começa "a pagar". */
export function lancamentoDoMes(r: Recorrencia, mes: string, hoje: DataISO): Lancamento {
  const data = dataNoMes(mes, r.dia);
  return {
    tipo: r.tipo, data, descricao: r.descricao, valor: r.valor, categoriaId: r.categoriaId, subcategoriaId: r.subcategoriaId,
    forma: r.forma, fixa: true, situacao: r.tipo === 'receita' && data <= hoje ? 'pago' : 'a_pagar',
    recorrenciaId: String(r.id), exemplo: r.exemplo, criadoEm: new Date().toISOString(),
  };
}

/** Cria os lançamentos que faltam, até o mês que vem. Devolve quantos foram criados. */
export async function gerarContasFixas(hoje: DataISO = hojeISO()): Promise<number> {
  const ate = somarMeses(mesDe(hoje), 1);
  return banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    const novos: Lancamento[] = [];
    for (const r of await banco.recorrencias.toArray()) {
      const existentes = new Set((await banco.lancamentos.where('recorrenciaId').equals(String(r.id)).toArray()).map((l) => mesDe(l.data)));
      for (const m of mesesDaRecorrencia(r, ate)) if (!existentes.has(m)) novos.push(lancamentoDoMes(r, m, hoje));
    }
    if (novos.length) await banco.lancamentos.bulkAdd(novos);
    return novos.length;
  });
}

/** Molde da repetição a partir do que foi digitado na tela de lançamento. */
function moldeDe(d: DadosLancamento): Omit<Recorrencia, 'inicio' | 'fim' | 'pulados' | 'criadoEm'> {
  return {
    tipo: d.tipo as Recorrencia['tipo'], descricao: d.descricao.trim(), valor: d.valor, categoriaId: d.categoriaId!,
    subcategoriaId: d.subcategoriaId || undefined, forma: d.forma, dia: Number(d.data.slice(8, 10)),
  };
}

/**
 * Lançamento novo que se repete: grava a repetição e o 1º lançamento, ligados.
 * Não cria meses do passado (para não duplicar o que já foi lançado à mão): a partir do mês atual.
 */
export async function criarComRepeticao(d: DadosLancamento, hoje: DataISO = hojeISO()): Promise<{ ids: number[]; recId: number }> {
  const r = await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    const mesDaConta = mesDe(d.data);
    const proximo = somarMeses(mesDaConta, 1);
    const inicio = proximo > mesDe(hoje) ? proximo : mesDe(hoje);
    const recId = await banco.recorrencias.add({ ...moldeDe(d), inicio, fim: null, pulados: [], criadoEm: new Date().toISOString() });
    const [primeiro] = montarLancamentos({ ...d, parcelas: 1, fixa: true });
    return { ids: [await banco.lancamentos.add({ ...primeiro, recorrenciaId: String(recId) })], recId };
  });
  await gerarContasFixas(hoje);
  return r;
}

/** Apaga a repetição e todos os lançamentos dela (usado no "Desfazer" logo depois de criar). */
export async function apagarRepeticao(recId: number): Promise<void> {
  await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    await banco.lancamentos.where('recorrenciaId').equals(String(recId)).delete();
    await banco.recorrencias.delete(recId);
  });
}

/** Lançamento que já existia passa a se repetir todo mês (marcou "repete" ao editar). */
export async function passarARepetir(id: number, hoje: DataISO = hojeISO()): Promise<void> {
  const l = await banco.lancamentos.get(id);
  if (!l || l.recorrenciaId || l.tipo === 'guardado') return;
  const proximo = somarMeses(mesDe(l.data), 1);
  const recId = await banco.recorrencias.add({
    tipo: l.tipo, descricao: l.descricao, valor: l.valor, categoriaId: l.categoriaId, subcategoriaId: l.subcategoriaId, forma: l.forma,
    dia: Number(l.data.slice(8, 10)), inicio: proximo > mesDe(hoje) ? proximo : mesDe(hoje), fim: null, pulados: [], exemplo: l.exemplo,
    criadoEm: new Date().toISOString(),
  });
  await banco.lancamentos.update(id, { fixa: true, recorrenciaId: String(recId) });
  await gerarContasFixas(hoje);
}

/**
 * Alteração "neste e nos próximos meses": muda o molde e os lançamentos seguintes que ainda
 * estão "a pagar" (os já pagos ficam como foram).
 */
export async function alterarDaquiPraFrente(id: number, d: DadosLancamento): Promise<void> {
  const l = await banco.lancamentos.get(id);
  if (!l?.recorrenciaId) return;
  const recId = Number(l.recorrenciaId);
  const rec = await banco.recorrencias.get(recId);
  // Se a data não mudou, o dia continua o da repetição (ex.: dia 31 que caiu em 30/11 segue 31)
  const molde = { ...moldeDe(d), ...(d.data === l.data && rec ? { dia: rec.dia } : {}) };
  await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    await banco.recorrencias.update(recId, molde);
    const seguintes = await banco.lancamentos.where('recorrenciaId').equals(l.recorrenciaId!).filter((x) => x.data > l.data && x.situacao === 'a_pagar').toArray();
    for (const x of seguintes) {
      await banco.lancamentos.update(x.id!, {
        descricao: molde.descricao, valor: molde.valor, categoriaId: molde.categoriaId, subcategoriaId: molde.subcategoriaId,
        forma: molde.forma, data: dataNoMes(mesDe(x.data), molde.dia),
      });
    }
  });
}

export interface Desfazer { executar: () => Promise<void> }

/** Exclui só a conta deste mês: o mês fica marcado para não ser gerado de novo. */
export async function excluirSoEsteMes(id: number): Promise<Desfazer | null> {
  const l = await banco.lancamentos.get(id);
  if (!l) return null;
  const rec = l.recorrenciaId ? await banco.recorrencias.get(Number(l.recorrenciaId)) : undefined;
  await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    await banco.lancamentos.delete(id);
    if (rec) await banco.recorrencias.update(rec.id!, { pulados: [...new Set([...rec.pulados, mesDe(l.data)])] });
  });
  return { executar: async () => { await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    await banco.lancamentos.put(l);
    if (rec) await banco.recorrencias.put(rec);
  }); } };
}

/**
 * Para de repetir a partir do mês informado: esse mês e os seguintes não são mais gerados,
 * e os lançamentos "a pagar" desses meses são apagados (os pagos ficam).
 */
export async function pararDeRepetir(recId: number, aPartirDe: string): Promise<Desfazer | null> {
  const rec = await banco.recorrencias.get(recId);
  if (!rec) return null;
  const apagados = await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    const lista = await banco.lancamentos.where('recorrenciaId').equals(String(recId)).filter((x) => mesDe(x.data) >= aPartirDe && x.situacao === 'a_pagar').toArray();
    await banco.lancamentos.bulkDelete(lista.map((x) => x.id!));
    await banco.recorrencias.update(recId, { fim: somarMeses(aPartirDe, -1) });
    return lista;
  });
  return { executar: async () => { await banco.transaction('rw', banco.recorrencias, banco.lancamentos, async () => {
    await banco.recorrencias.put(rec);
    await banco.lancamentos.bulkPut(apagados);
  }); } };
}

/** Marca uma conta como paga (ou volta para "a pagar"). */
export async function marcarPaga(id: number, paga: boolean): Promise<void> {
  await banco.lancamentos.update(id, { situacao: paga ? 'pago' : 'a_pagar' });
}

/** Repetições que ainda vão continuar depois do mês informado (sem fim, ou com fim mais adiante). */
export function recorrenciasAtivas(lista: Recorrencia[], mes: string): Recorrencia[] {
  return lista.filter((r) => !r.fim || r.fim > mes);
}

export function useRecorrencias() {
  return useLiveQuery(() => banco.recorrencias.toArray(), []);
}

// ---------- Contas do mês ----------

export interface ContaDoMes {
  /** Lançamento real; ausente = conta prevista (mês ainda não gerado). */
  lancamento?: Lancamento;
  recorrencia?: Recorrencia;
  descricao: string;
  valor: number;
  categoriaId: number;
  data: DataISO;
  paga: boolean;
}

/**
 * Lista do mês para ir ticando: despesas que se repetem e despesas "a pagar" (menos parcelas
 * do cartão, que são pagas na fatura). Meses além do já gerado mostram as contas previstas.
 */
export function contasDoMes(lancamentos: Lancamento[], recorrencias: Recorrencia[], mes: string, hoje: DataISO): ContaDoMes[] {
  const doMes = lancamentos.filter((l) => l.tipo === 'despesa' && mesDe(l.data) === mes && (l.recorrenciaId || (l.situacao === 'a_pagar' && !l.parcela)));
  const contas: ContaDoMes[] = doMes.map((l) => ({
    lancamento: l, recorrencia: recorrencias.find((r) => String(r.id) === l.recorrenciaId),
    descricao: l.descricao, valor: l.valor, categoriaId: l.categoriaId, data: l.data, paga: l.situacao === 'pago',
  }));
  if (mes > somarMeses(mesDe(hoje), 1)) {
    for (const r of recorrencias) {
      if (r.tipo !== 'despesa' || !mesesDaRecorrencia(r, mes, mes).length) continue;
      if (doMes.some((l) => l.recorrenciaId === String(r.id))) continue;
      contas.push({ recorrencia: r, descricao: r.descricao, valor: r.valor, categoriaId: r.categoriaId, data: dataNoMes(mes, r.dia), paga: false });
    }
  }
  return contas.sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
}
