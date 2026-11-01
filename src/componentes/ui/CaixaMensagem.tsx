import { AlertTriangle, Bell, Info, PartyPopper, Trophy } from 'lucide-react';
import type { Mensagem } from '../../servicos/emprestimos';

// Mensagem do contrato: parabéns (verde), lembrete (amarelo), atraso (vermelho), quitado.
// A cor nunca é a única informação: sempre há ícone e texto.

const ESTILO: Record<Mensagem['tipo'], { classe: string; Icone: typeof Info }> = {
  atraso: { classe: 'bg-perigo-fundo text-perigo-texto border-[#F3B9B9]', Icone: AlertTriangle },
  lembrete: { classe: 'bg-alerta-fundo text-alerta-texto border-[#F2D58A]', Icone: Bell },
  parabens: { classe: 'bg-[#E7F6EA] text-ok-texto border-[#BFE5C8]', Icone: PartyPopper },
  quitado: { classe: 'bg-[#E7F6EA] text-ok-texto border-[#BFE5C8]', Icone: Trophy },
  info: { classe: 'bg-primaria-clara text-[#2E2860] border-borda', Icone: Info },
};

export function CaixaMensagem({ mensagem }: { mensagem: Mensagem }) {
  if (!mensagem.texto) return null;
  const { classe, Icone } = ESTILO[mensagem.tipo];
  return (
    <p className={`m-0 flex items-start gap-2.5 rounded-2xl border p-3 text-sm font-semibold ${classe}`} data-testid={`mensagem-${mensagem.tipo}`}>
      <Icone size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{mensagem.texto}</span>
    </p>
  );
}
