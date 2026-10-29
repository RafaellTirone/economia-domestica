import { CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Avisos rápidos na parte de baixo da tela ("Despesa salva", "Lançamento excluído — Desfazer").
// São lidos por leitores de tela (aria-live) e somem sozinhos depois de alguns segundos.

interface Aviso { id: number; texto: string; acao?: { rotulo: string; executar: () => void } }
interface ContextoAvisos { avisar: (texto: string, acao?: Aviso['acao']) => void }

const Contexto = createContext<ContextoAvisos | null>(null);
const DURACAO_MS = 7000;

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<number>();

  const fechar = useCallback(() => setAviso(null), []);
  const avisar = useCallback((texto: string, acao?: Aviso['acao']) => setAviso({ id: Date.now(), texto, acao }), []);

  useEffect(() => {
    window.clearTimeout(temporizador.current);
    if (aviso) temporizador.current = window.setTimeout(fechar, DURACAO_MS);
    return () => window.clearTimeout(temporizador.current);
  }, [aviso, fechar]);

  return (
    <Contexto.Provider value={{ avisar }}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
        {aviso && (
          <div key={aviso.id} data-testid="aviso" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-tinta py-2 pl-4 pr-2 text-sm text-white shadow-xl">
            <CheckCircle2 size={20} aria-hidden="true" className="shrink-0 text-[#7BE08F]" />
            <span className="flex-1 py-2">{aviso.texto}</span>
            {aviso.acao && (
              <button type="button" onClick={() => { aviso.acao!.executar(); fechar(); }}
                className="min-h-11 rounded-xl px-3 font-extrabold text-[#C9C2FF] hover:bg-white/10">{aviso.acao.rotulo}</button>
            )}
            <button type="button" onClick={fechar} aria-label="Fechar aviso" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/10">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos(): ContextoAvisos {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAvisos precisa estar dentro de <ProvedorAvisos>');
  return c;
}
