import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DataISO } from '../../tipos';
import { diasNoMes, feriadosDoAno, formatarData, hojeISO, lerData, montarData, nomeDoMes, partesDaData } from '../../utils/datas';

// Campo de data do app: dá para DIGITAR (dd/mm/aaaa) ou tocar no desenho do calendário,
// que abre um calendário próprio em português, com qualquer mês e ano (1900 a 2100).
// Não depende do calendário do navegador (que em alguns lugares não abre).

const ANO_MIN = 1900;
const ANO_MAX = 2100;

/** Aceita "29/10/2026", "29102026" e também "2026-10-29". */
function interpretar(texto: string): DataISO | null {
  const t = texto.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return lerData(formatarData(t));
  if (/^\d{8}$/.test(t)) return lerData(`${t.slice(0, 2)}/${t.slice(2, 4)}/${t.slice(4)}`);
  return lerData(t);
}

export function CampoData({ id, valor, aoMudar, rotulo, className = '' }: {
  id: string;
  valor: DataISO;
  aoMudar: (d: DataISO) => void;
  rotulo: string;
  className?: string;
}) {
  const [texto, setTexto] = useState(formatarData(valor));
  const [invalida, setInvalida] = useState(false);
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  // Quando a data muda (pelo calendário ou por fora), o texto acompanha no mesmo instante
  const [ultimoValor, setUltimoValor] = useState(valor);
  if (valor !== ultimoValor) {
    setUltimoValor(valor);
    setTexto(formatarData(valor));
    setInvalida(false);
  }

  function digitar(t: string) {
    const limpo = t.replace(/[^\d/-]/g, '').slice(0, 10);
    setTexto(limpo);
    const d = limpo.length >= 8 ? interpretar(limpo) : null;
    if (d) { setInvalida(false); aoMudar(d); }
  }

  return (
    <span className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className={`relative flex min-h-12 items-center rounded-xl border bg-cartao text-base text-tinta focus-within:border-primaria ${invalida ? 'border-status-perigo' : 'border-borda-forte'}`}>
        <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" value={texto} aria-label={rotulo}
          aria-invalid={invalida} aria-describedby={invalida ? `${id}-erro` : undefined}
          onChange={(e) => digitar(e.target.value)}
          onBlur={() => { if (!interpretar(texto)) { setInvalida(texto.trim() !== ''); setTexto(formatarData(valor)); } }}
          className="min-h-11 w-full min-w-0 rounded-xl border-0 bg-transparent pl-3 pr-1 text-base text-tinta outline-none" data-testid={`${id}-texto`} />
        <button ref={botao} type="button" onClick={() => setAberto(true)} aria-label={`Abrir calendário: ${rotulo}`} aria-haspopup="dialog"
          className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl text-primaria-escura hover:bg-primaria-clara">
          <CalendarDays size={20} aria-hidden="true" />
        </button>
      </span>
      {invalida && <span id={`${id}-erro`} role="alert" className="text-xs font-bold text-perigo-texto">Data inválida. Use dd/mm/aaaa.</span>}
      {aberto && (
        <Calendario valor={valor} rotulo={rotulo}
          aoEscolher={(d) => { aoMudar(d); setAberto(false); botao.current?.focus(); }}
          aoFechar={() => { setAberto(false); botao.current?.focus(); }} />
      )}
    </span>
  );
}

const SEMANA = [['D', 'domingo'], ['S', 'segunda'], ['T', 'terça'], ['Q', 'quarta'], ['Q', 'quinta'], ['S', 'sexta'], ['S', 'sábado']] as const;

/** Calendário em janela: mês, ano, setas, "Hoje", feriados marcados. Teclado: setas, Enter, Esc. */
function Calendario({ valor, rotulo, aoEscolher, aoFechar }: { valor: DataISO; rotulo: string; aoEscolher: (d: DataISO) => void; aoFechar: () => void }) {
  const hoje = hojeISO();
  const inicial = partesDaData(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoje);
  const [visto, setVisto] = useState({ ano: inicial.ano, mes: inicial.mes });
  const [foco, setFoco] = useState<DataISO>(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoje);
  const grade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aoFechar]);
  // Foco no dia selecionado (ou no dia em foco) ao abrir e ao navegar pelo teclado
  useEffect(() => { grade.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus(); }, [foco, visto]);

  const mover = (delta: number) => setVisto(({ ano, mes }) => {
    const t = ano * 12 + mes - 1 + delta;
    const novo = { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
    return novo.ano < ANO_MIN || novo.ano > ANO_MAX ? { ano, mes } : novo;
  });
  const irPara = (d: DataISO) => { const p = partesDaData(d); setVisto({ ano: p.ano, mes: p.mes }); setFoco(d); };

  function teclado(e: React.KeyboardEvent) {
    const passos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in passos)) return;
    e.preventDefault();
    const p = partesDaData(foco);
    const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + passos[e.key]));
    irPara(montarData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }

  const primeiroDia = new Date(Date.UTC(visto.ano, visto.mes - 1, 1)).getUTCDay();
  const total = diasNoMes(visto.ano, visto.mes);
  const feriados = feriadosDoAno(visto.ano);
  const celulas: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label={`Calendário: ${rotulo}`} onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl bg-cartao p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl sm:w-[360px] sm:rounded-3xl" data-testid="calendario">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="m-0 flex-1 text-base font-extrabold">{rotulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar calendário" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borda-forte"><ChevronLeft size={18} aria-hidden="true" /></button>
          <label htmlFor="calendario-mes" className="sr-only">Mês</label>
          <select id="calendario-mes" value={visto.mes} onChange={(e) => setVisto((v) => ({ ...v, mes: Number(e.target.value) }))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-borda-forte bg-cartao px-2 text-base font-bold capitalize text-tinta">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{nomeDoMes(i + 1)}</option>)}
          </select>
          <label htmlFor="calendario-ano" className="sr-only">Ano</label>
          <select id="calendario-ano" value={visto.ano} onChange={(e) => setVisto((v) => ({ ...v, ano: Number(e.target.value) }))} className="min-h-11 w-24 rounded-xl border border-borda-forte bg-cartao px-2 text-base font-bold text-tinta">
            {Array.from({ length: ANO_MAX - ANO_MIN + 1 }, (_, i) => ANO_MIN + i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borda-forte"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>

        <div className="mt-3 grid grid-cols-7 text-center text-xs font-bold text-suave" aria-hidden="true">
          {SEMANA.map(([l, n]) => <span key={n} title={n} className="py-1">{l}</span>)}
        </div>
        <div ref={grade} role="grid" aria-label={`${nomeDoMes(visto.mes)} de ${visto.ano}`} onKeyDown={teclado} className="grid grid-cols-7 gap-1">
          {celulas.map((dia, i) => {
            if (dia === null) return <span key={`v${i}`} />;
            const d = montarData(visto.ano, visto.mes, dia);
            const selecionado = d === valor;
            const ehHoje = d === hoje;
            const feriado = feriados.get(d);
            return (
              <button key={d} type="button" data-dia={d} tabIndex={d === foco ? 0 : -1} onClick={() => aoEscolher(d)} aria-pressed={selecionado}
                aria-label={`${dia} de ${nomeDoMes(visto.mes)} de ${visto.ano}${ehHoje ? ', hoje' : ''}${feriado ? `, feriado: ${feriado}` : ''}`} title={feriado}
                className={`relative flex h-11 items-center justify-center rounded-xl text-[15px] tabular-nums ${selecionado ? 'bg-primaria font-extrabold text-white' : ehHoje ? 'font-extrabold text-primaria-escura ring-2 ring-primaria' : 'text-tinta hover:bg-primaria-clara'}`}>
                {dia}
                {feriado && <span aria-hidden="true" className={`absolute bottom-1 h-1 w-1 rounded-full ${selecionado ? 'bg-white' : 'bg-status-perigo'}`} />}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => aoEscolher(hoje)} className="min-h-11 rounded-xl border-2 border-primaria px-4 font-extrabold text-primaria-escura">Hoje ({formatarData(hoje)})</button>
          <span className="ml-auto flex items-center gap-1 text-xs text-suave"><span className="h-1.5 w-1.5 rounded-full bg-status-perigo" aria-hidden="true" />feriado</span>
        </div>
      </div>
    </div>
  );
}
