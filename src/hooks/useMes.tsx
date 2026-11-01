import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hojeISO, partesDaData } from '../utils/datas';

// Mês que está sendo visto no app (compartilhado entre as telas).

interface ContextoMes {
  /** Data de hoje (atualiza sozinha na virada do dia, mesmo com o app aberto). */
  hoje: string;
  ano: number;
  mes: number;
  voltar: () => void;
  avancar: () => void;
  irParaHoje: () => void;
}

const Contexto = createContext<ContextoMes | null>(null);

export function ProvedorMes({ children }: { children: ReactNode }) {
  const [hoje, setHoje] = useState(hojeISO());
  const inicial = partesDaData(hoje);
  const [atual, setAtual] = useState({ ano: inicial.ano, mes: inicial.mes });
  const hojeAnterior = useRef(hoje);

  // O app pode ficar aberto por dias (instalado no celular): confere a data a cada minuto
  // e quando o app volta a aparecer na tela. Na virada do mês, se estava no mês atual, acompanha.
  useEffect(() => {
    const conferir = () => {
      const agora = hojeISO();
      if (agora === hojeAnterior.current) return;
      const antes = partesDaData(hojeAnterior.current), depois = partesDaData(agora);
      hojeAnterior.current = agora;
      setHoje(agora);
      setAtual((a) => (a.ano === antes.ano && a.mes === antes.mes ? { ano: depois.ano, mes: depois.mes } : a));
    };
    const relogio = window.setInterval(conferir, 60_000);
    document.addEventListener('visibilitychange', conferir);
    window.addEventListener('focus', conferir);
    return () => { window.clearInterval(relogio); document.removeEventListener('visibilitychange', conferir); window.removeEventListener('focus', conferir); };
  }, []);

  const valor = useMemo<ContextoMes>(() => {
    const mover = (delta: number) => setAtual(({ ano, mes }) => {
      const total = ano * 12 + (mes - 1) + delta;
      return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
    });
    return {
      hoje,
      ...atual,
      voltar: () => mover(-1),
      avancar: () => mover(1),
      irParaHoje: () => { const h = partesDaData(hojeISO()); setAtual({ ano: h.ano, mes: h.mes }); },
    };
  }, [atual, hoje]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useMes(): ContextoMes {
  const c = useContext(Contexto);
  if (!c) throw new Error('useMes precisa estar dentro de <ProvedorMes>');
  return c;
}
