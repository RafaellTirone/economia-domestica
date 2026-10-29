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
