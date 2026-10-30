import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
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

/** Todos os lançamentos (para sugestões e para a busca por período personalizado). */
export function useTodosLancamentos() {
  return useLiveQuery(() => banco.lancamentos.toArray(), []);
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
