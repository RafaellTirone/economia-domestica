import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ResultadoConferencia } from '../../servicos/conferenciaContrato';

// Lista de conferência do contrato, preenchida pela análise do app: um item por informação,
// com o valor que o app usou e ✓ (confere) ou ⚠ (precisa de atenção). Ícone + texto, nunca só cor.

export function ListaConferencia({ conferencia }: { conferencia: ResultadoConferencia }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="lista-conferencia">
      {conferencia.itens.map((i) => (
        <li key={i.id} data-situacao={i.situacao}
          className={`flex items-start gap-2.5 rounded-xl p-2.5 text-sm ${i.situacao === 'ok' ? 'bg-[#E7F6EA]' : i.essencial ? 'border border-status-alerta bg-alerta-fundo' : 'bg-alerta-fundo'}`}>
          {i.situacao === 'ok'
            ? <CheckCircle2 size={18} aria-label="Confere" className="mt-0.5 shrink-0 text-ok-texto" />
            : <AlertTriangle size={18} aria-label="Atenção" className="mt-0.5 shrink-0 text-alerta-texto" />}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <strong>{i.rotulo}</strong>
              <strong className="tabular-nums">{i.valor}</strong>
            </span>
            <span className={`block text-xs ${i.situacao === 'ok' ? 'text-ok-texto' : 'text-alerta-texto'}`}>{i.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
