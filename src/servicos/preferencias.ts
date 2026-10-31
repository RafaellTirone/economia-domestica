import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { banco } from '../db/banco';

// Preferências de visualização (ex.: tipo de gráfico escolhido em cada relatório).
// Ficam no aparelho e valem da próxima vez que a pessoa abrir.

const CHAVE = 'preferencias-graficos';

export async function salvarGraficoPreferido(grafico: string, tipo: string): Promise<void> {
  // Ler e gravar na mesma transação: toques rápidos seguidos não se atropelam
  await banco.transaction('rw', banco.configuracoes, async () => {
    const atual = ((await banco.configuracoes.get(CHAVE))?.valor as Record<string, string> | undefined) ?? {};
    await banco.configuracoes.put({ chave: CHAVE, valor: { ...atual, [grafico]: tipo } });
  });
}

/** Tipo de gráfico escolhido para um gráfico (ou o padrão). */
export function useGraficoPreferido<T extends string>(grafico: string, padrao: T, permitidos: readonly T[]): [T, (t: T) => void] {
  const prefs = useLiveQuery(async () => ((await banco.configuracoes.get(CHAVE))?.valor as Record<string, string> | undefined) ?? {}, []);
  // A troca aparece na hora; a gravação no aparelho acontece em seguida
  const [escolhaAgora, setEscolhaAgora] = useState<T | null>(null);
  const salvo = (escolhaAgora ?? prefs?.[grafico]) as T | undefined;
  const valor = salvo && permitidos.includes(salvo) ? salvo : padrao;
  return [valor, (t: T) => { setEscolhaAgora(t); void salvarGraficoPreferido(grafico, t); }];
}
