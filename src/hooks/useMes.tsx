import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { hojeISO, partesDaData } from '../utils/datas';

// Mês que está sendo visto no app (compartilhado entre as telas).

interface ContextoMes {
  ano: number;
  mes: number;
  voltar: () => void;
  avancar: () => void;
  irParaHoje: () => void;
}

const Contexto = createContext<ContextoMes | null>(null);

export function ProvedorMes({ children }: { children: ReactNode }) {
  const hoje = partesDaData(hojeISO());
  const [atual, setAtual] = useState({ ano: hoje.ano, mes: hoje.mes });

  const valor = useMemo<ContextoMes>(() => {
    const mover = (delta: number) => setAtual(({ ano, mes }) => {
      const total = ano * 12 + (mes - 1) + delta;
      return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
    });
    return {
      ...atual,
      voltar: () => mover(-1),
      avancar: () => mover(1),
      irParaHoje: () => { const h = partesDaData(hojeISO()); setAtual({ ano: h.ano, mes: h.mes }); },
    };
  }, [atual]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useMes(): ContextoMes {
  const c = useContext(Contexto);
  if (!c) throw new Error('useMes precisa estar dentro de <ProvedorMes>');
  return c;
}
