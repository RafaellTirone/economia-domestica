import { BellRing, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { useAvisos } from '../hooks/useAvisos';
import { useMes } from '../hooks/useMes';
import { carregarEventos, gerarIcs, ligarNotificacoes, useNotificacoesAtivas } from '../servicos/lembretes';
import { baixarArquivo } from '../servicos/relatorios';

// Lembretes: arquivo para a agenda do celular (.ics) e aviso ao abrir o app.

/** Botão que baixa o arquivo da agenda com os vencimentos dos próximos 12 meses. */
export function BotaoAgenda({ className = '' }: { className?: string }) {
  const { hoje } = useMes();
  const { avisar } = useAvisos();
  async function baixar() {
    const { eventos } = await carregarEventos(hoje);
    if (!eventos.length) { avisar('Nenhum vencimento nos próximos 12 meses para pôr na agenda.'); return; }
    baixarArquivo(`vencimentos-nosso-dinheiro-${hoje}.ics`, gerarIcs(eventos), 'text/calendar;charset=utf-8');
    avisar(`${eventos.length} lembretes prontos. Abra o arquivo baixado para colocar na agenda.`);
  }
  return (
    <button type="button" onClick={() => void baixar()} className={`flex min-h-11 items-center gap-2 rounded-xl border-2 border-primaria bg-cartao px-4 font-bold text-primaria-escura ${className}`}>
      <CalendarPlus size={18} aria-hidden="true" />Pôr os vencimentos na agenda
    </button>
  );
}

export function SecaoLembretes() {
  const ativas = useNotificacoesAtivas();
  const { avisar } = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  // Mostra a escolha na hora (o navegador pode demorar pedindo a permissão)
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const suportado = typeof Notification !== 'undefined';

  async function alternar(ligar: boolean) {
    setOcupado(true);
    setEscolha(ligar);
    try {
      const ok = await ligarNotificacoes(ligar);
      setEscolha(ok);
      if (ligar && !ok) avisar('O navegador não permitiu os avisos. Libere as notificações deste site nas configurações do navegador.');
      else avisar(ligar ? 'Pronto: ao abrir o app, ele avisa o que vence hoje e nos próximos 3 dias.' : 'Avisos desligados.');
    } finally { setOcupado(false); }
  }

  return (
    <section aria-labelledby="titulo-lembretes" className="rounded-[22px] border border-borda bg-cartao p-5">
      <h2 id="titulo-lembretes" className="m-0 text-lg font-extrabold">Lembretes de vencimento</h2>
      <p className="m-0 mt-1 text-sm text-suave">
        A agenda do celular avisa <b>3 dias antes</b> e <b>no dia</b> de cada conta, parcela de empréstimo e dia de guardar no cofrinho — mesmo com o app fechado.
        Baixe de novo quando cadastrar contas novas (os lembretes repetidos são atualizados, não duplicados).
      </p>
      <BotaoAgenda className="mt-3" />
      <label className="mt-3 flex min-h-11 items-start gap-3 text-[15px]">
        <input type="checkbox" checked={escolha ?? !!ativas} disabled={ocupado ||  !suportado || ativas === undefined} onChange={(e) => void alternar(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-primaria" />
        <span className="flex items-start gap-1.5"><BellRing size={18} aria-hidden="true" className="mt-0.5 shrink-0" /><span>Avisar quando eu abrir o app<br /><span className="text-sm text-suave">{suportado ? 'Uma notificação por dia com o que vence hoje e nos próximos 3 dias.' : 'Este navegador não mostra notificações; use a agenda.'}</span></span></span>
      </label>
    </section>
  );
}
