import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
import type { RegraSalario } from '../utils/datas';

// Configurações guardadas no aparelho (ex.: como o salário é pago).

const CHAVE_SALARIO = 'salario';

export async function salvarRegraSalario(regra: RegraSalario): Promise<void> {
  await banco.configuracoes.put({ chave: CHAVE_SALARIO, valor: regra });
}

export async function lerRegraSalario(): Promise<RegraSalario | null> {
  return ((await banco.configuracoes.get(CHAVE_SALARIO))?.valor as RegraSalario | undefined) ?? null;
}

/** Regra do salário com atualização automática (undefined = carregando, null = não cadastrada). */
export function useRegraSalario() {
  return useLiveQuery(lerRegraSalario, []);
}
