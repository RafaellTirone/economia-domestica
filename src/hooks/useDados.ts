import { liveQuery } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { banco } from '../db/banco';
import type { Lancamento } from '../tipos';
import { limitesDoMes } from '../utils/datas';

// Leitura dos dados com atualização automática: quando algo muda no banco, a tela se atualiza sozinha.

export function useCategorias() {
  return useLiveQuery(() => banco.categorias.orderBy('ordem').toArray(), []);
}

export function useLancamentosDoMes(ano: number, mes: number) {
  return useLiveQuery(() => {
    const { inicio, fim } = limitesDoMes(ano, mes);
    return banco.lancamentos.where('data').between(inicio, fim, true, true).toArray();
  }, [ano, mes]);
}

// Todos os lançamentos: UMA leitura compartilhada por todas as partes da tela (antes cada parte lia
// tudo de novo). Fica guardada uns segundos depois de sair da tela, para a próxima abrir na hora.
let todos: Lancamento[] | undefined;
let assinatura: { unsubscribe(): void } | null = null;
let desligar: ReturnType<typeof setTimeout> | undefined;
const ouvintes = new Set<() => void>();

function assinarTodos(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  clearTimeout(desligar);
  assinatura ??= liveQuery(() => banco.lancamentos.toArray()).subscribe({
    next: (lista) => { todos = lista; ouvintes.forEach((f) => f()); },
    error: (e) => console.error('Erro ao ler os lançamentos', e),
  });
  return () => {
    ouvintes.delete(aoMudar);
    if (!ouvintes.size) desligar = setTimeout(() => { if (!ouvintes.size) { assinatura?.unsubscribe(); assinatura = null; todos = undefined; } }, 10_000);
  };
}

/** Todos os lançamentos (para sugestões, resumos do ano e busca por período). */
export function useTodosLancamentos(): Lancamento[] | undefined {
  return useSyncExternalStore(assinarTodos, () => todos);
}

/** Um lançamento pelo id (null = não existe). */
export function useLancamento(id: number | null) {
  return useLiveQuery(async () => (id ? (await banco.lancamentos.get(id)) ?? null : null), [id]);
}

/** Empréstimos com os pagamentos de cada um. */
export function useEmprestimos() {
  return useLiveQuery(async () => {
    const [emprestimos, pagamentos] = await Promise.all([banco.emprestimos.toArray(), banco.pagamentosParcela.toArray()]);
    return emprestimos.map((e) => ({ emprestimo: e, pagamentos: pagamentos.filter((p) => p.emprestimoId === e.id) }));
  }, []);
}

/** Um empréstimo, seus pagamentos e o PDF do contrato (null = não existe). */
export function useEmprestimo(id: number | null) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const emprestimo = await banco.emprestimos.get(id);
    if (!emprestimo) return null;
    const pagamentos = await banco.pagamentosParcela.where('emprestimoId').equals(id).toArray();
    const arquivo = emprestimo.contratoArquivoId ? (await banco.arquivos.get(emprestimo.contratoArquivoId)) ?? null : null;
    return { emprestimo, pagamentos, arquivo };
  }, [id]);
}

/** Cofrinhos com os movimentos de cada um. */
export function useCofrinhos() {
  return useLiveQuery(async () => {
    const [cofrinhos, movimentos] = await Promise.all([banco.cofrinhos.toArray(), banco.movimentosCofrinho.toArray()]);
    return cofrinhos.map((c) => ({ cofrinho: c, movimentos: movimentos.filter((m) => m.cofrinhoId === c.id) }));
  }, []);
}

/** Um cofrinho e seus movimentos (null = não existe). */
export function useCofrinho(id: number | null) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const cofrinho = await banco.cofrinhos.get(id);
    if (!cofrinho) return null;
    return { cofrinho, movimentos: await banco.movimentosCofrinho.where('cofrinhoId').equals(id).toArray() };
  }, [id]);
}

/** Desejos (intenções de compra). */
export function useDesejos() {
  return useLiveQuery(() => banco.desejos.toArray(), []);
}
