import { CalendarDays } from 'lucide-react';
import type { DataISO } from '../../tipos';
import { formatarData } from '../../utils/datas';

// Campo de data que SEMPRE mostra dd/mm/aaaa, mesmo em navegador configurado em inglês.
// Por baixo continua o seletor de data do próprio aparelho (calendário nativo), invisível
// sobre o texto: tocar/clicar abre o calendário normalmente.

export function CampoData({ id, valor, aoMudar, rotulo, className = '' }: {
  id: string;
  valor: DataISO;
  aoMudar: (d: DataISO) => void;
  rotulo: string;
  className?: string;
}) {
  return (
    <span className={`relative flex min-h-12 items-center gap-2 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta focus-within:border-primaria focus-within:outline focus-within:outline-3 focus-within:outline-primaria ${className}`}>
      <CalendarDays size={18} aria-hidden="true" className="shrink-0 text-suave" />
      <span aria-hidden="true" data-testid={`${id}-texto`}>{formatarData(valor)}</span>
      <input id={id} type="date" value={valor} aria-label={`${rotulo}: ${formatarData(valor)}`} required
        onChange={(e) => e.target.value && aoMudar(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* navegador sem showPicker: segue o padrão */ } }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
  );
}
