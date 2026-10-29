import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMes } from '../../hooks/useMes';
import { formatarMesAno, formatarMesAnoCurto } from '../../utils/datas';

// Botões para trocar o mês exibido.
export function SeletorMes({ compacto = false }: { compacto?: boolean }) {
  const { ano, mes, voltar, avancar } = useMes();
  return (
    <div className="flex items-center rounded-xl border border-borda-forte bg-cartao">
      <button type="button" onClick={voltar} aria-label="Mês anterior" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="min-w-[5.5rem] text-center text-sm font-bold" aria-live="polite">
        {compacto ? formatarMesAnoCurto(ano, mes) : formatarMesAno(ano, mes)}
      </span>
      <button type="button" onClick={avancar} aria-label="Próximo mês" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
