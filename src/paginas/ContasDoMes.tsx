import { Check, Repeat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { SeletorMes } from '../componentes/ui/SeletorMes';
import { BotaoAgenda } from '../componentes/SecaoLembretes';
import { useAvisos } from '../hooks/useAvisos';
import { useCategorias, useTodosLancamentos } from '../hooks/useDados';
import { useMes } from '../hooks/useMes';
import { contasDoMes, marcarPaga, pararDeRepetir, recorrenciasAtivas, somarMeses, useRecorrencias, mesDe, type ContaDoMes } from '../servicos/recorrencias';
import type { Recorrencia } from '../tipos';
import { diferencaEmDias, formatarData, formatarMesAno, montarData } from '../utils/datas';
import { formatarMoeda } from '../utils/moeda';

// Contas do mês: lista para ir ticando o que já foi pago, com o que vence logo e o que atrasou.
// Embaixo, as contas que se repetem todo mês (com a opção de parar de repetir).

/** Texto do prazo: "paga", "atrasada há 3 dias", "vence hoje", "vence em 5 dias". */
function prazo(c: ContaDoMes, hoje: string): { texto: string; cor: string } {
  if (c.paga) return { texto: 'paga', cor: 'text-ok-texto' };
  const dias = diferencaEmDias(hoje, c.data);
  if (dias < 0) return { texto: `atrasada há ${-dias} dia${dias === -1 ? '' : 's'}`, cor: 'text-perigo-texto' };
  if (dias === 0) return { texto: 'vence hoje', cor: 'text-alerta-texto' };
  if (dias === 1) return { texto: 'vence amanhã', cor: 'text-alerta-texto' };
  return { texto: `vence em ${dias} dias`, cor: dias <= 3 ? 'text-alerta-texto' : 'text-suave' };
}

export function ContasDoMes() {
  const { ano, mes, hoje } = useMes();
  const categorias = useCategorias();
  const lancamentos = useTodosLancamentos();
  const recorrencias = useRecorrencias();
  const { avisar } = useAvisos();
  const [parando, setParando] = useState<Recorrencia | null>(null);
  const mesTexto = montarData(ano, mes, 1).slice(0, 7);
  const contas = useMemo(
    () => (lancamentos && recorrencias ? contasDoMes(lancamentos, recorrencias, mesTexto, hoje) : null),
    [lancamentos, recorrencias, mesTexto, hoje],
  );
  if (!contas || !categorias || !recorrencias) return <p className="text-suave">Carregando…</p>;

  const total = contas.reduce((s, c) => s + c.valor, 0);
  const pago = contas.filter((c) => c.paga).reduce((s, c) => s + c.valor, 0);
  const atrasadas = contas.filter((c) => !c.paga && c.data < hoje).length;
  const ativas = recorrenciasAtivas(recorrencias, mesDe(hoje)).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.dia - b.dia);

  async function ticar(c: ContaDoMes) {
    if (!c.lancamento) return;
    await marcarPaga(c.lancamento.id!, !c.paga);
    avisar(c.paga ? `${c.descricao || 'Conta'} voltou para "a pagar".` : `${c.descricao || 'Conta'} marcada como paga.`, {
      rotulo: 'Desfazer', executar: () => void marcarPaga(c.lancamento!.id!, c.paga),
    });
  }

  async function confirmarParar() {
    if (!parando) return;
    // Para a partir do mês que vem: a conta deste mês continua na lista
    const desfazer = await pararDeRepetir(parando.id!, somarMeses(mesDe(hoje), 1));
    avisar(`${parando.descricao || 'Conta'} não vai mais se repetir.`, desfazer ? { rotulo: 'Desfazer', executar: () => void desfazer.executar() } : undefined);
    setParando(null);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Contas do mês</h1>
        <SeletorMes compacto />
      </div>

      <section aria-label="Resumo das contas" className="rounded-[22px] border border-borda bg-cartao p-4" data-testid="resumo-contas">
        {contas.length === 0 ? (
          <p className="m-0 text-suave">Nenhuma conta em {formatarMesAno(ano, mes)}. Ao lançar aluguel, luz ou internet, marque <b>"Repete todo mês"</b> e ela aparece aqui todo mês.</p>
        ) : (
          <>
            <p className="m-0 text-lg font-extrabold">Pagas {formatarMoeda(pago)} de {formatarMoeda(total)}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-borda" role="progressbar" aria-label="Contas pagas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((pago / total) * 100) : 0}>
              <div className="h-full rounded-full bg-status-ok" style={{ width: `${total ? (pago / total) * 100 : 0}%` }} />
            </div>
            <p className="m-0 mt-2 text-sm font-bold">
              Falta pagar {formatarMoeda(total - pago)}
              {atrasadas > 0 && <span className="text-perigo-texto"> · {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span>}
            </p>
          </>
        )}
      </section>

      {contas.length > 0 && (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-borda bg-cartao p-0" aria-label={`Contas de ${formatarMesAno(ano, mes)}`}>
          {contas.map((c) => {
            const cat = categorias.find((x) => x.id === c.categoriaId);
            const p = prazo(c, hoje);
            const nome = c.descricao || cat?.nome || 'Conta';
            return (
              <li key={c.lancamento?.id ?? `prev-${c.recorrencia?.id}`} className="flex min-h-16 items-center gap-3 border-b border-borda px-3 py-2 last:border-b-0" data-testid="conta">
                {c.lancamento ? (
                  <button type="button" role="checkbox" aria-checked={c.paga} aria-label={`${nome}: ${c.paga ? 'paga' : 'marcar como paga'}`} onClick={() => void ticar(c)}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 ${c.paga ? 'border-status-ok bg-status-ok text-white' : 'border-borda-forte bg-cartao text-transparent'}`}>
                    <Check size={22} strokeWidth={3} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-borda-forte text-suave" title="Prevista"><Repeat size={18} aria-hidden="true" /></span>
                )}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: cat?.cor ?? '#888' }}><IconeCategoria nome={cat?.icone ?? 'caixa'} tamanho={16} /></span>
                <span className="min-w-0 flex-1">
                  {c.lancamento
                    ? <Link to={`/lancar/${c.lancamento.id}`} className={`flex min-h-11 items-center truncate font-bold no-underline ${c.paga ? 'text-suave line-through' : 'text-tinta'}`}>{nome}</Link>
                    : <span className="block truncate font-bold text-tinta">{nome}</span>}
                  <span className={`block text-xs font-bold ${c.lancamento ? p.cor : 'text-suave'}`}>
                    {formatarData(c.data)} · {c.lancamento ? p.texto : 'prevista'}{c.recorrencia ? ' · todo mês' : ''}
                  </span>
                </span>
                <span className={`shrink-0 font-extrabold tabular-nums ${c.paga ? 'text-suave' : ''}`}>{formatarMoeda(c.valor)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="titulo-repetem" className="flex flex-col gap-2">
        <h2 id="titulo-repetem" className="m-0 text-lg font-extrabold">Contas que se repetem ({ativas.length})</h2>
        {ativas.length === 0 ? (
          <p className="m-0 text-sm text-suave">Nenhuma ainda. No <Link to="/lancar" className="inline-flex min-h-11 items-center font-bold text-primaria">Lançar</Link>, marque "Repete todo mês".</p>
        ) : (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-borda bg-cartao p-0">
            {ativas.map((r) => {
              const cat = categorias.find((x) => x.id === r.categoriaId);
              return (
                <li key={r.id} className="flex min-h-14 flex-wrap items-center gap-2 border-b border-borda px-3 py-2 last:border-b-0" data-testid="repeticao">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{r.descricao || cat?.nome}</span>
                    <span className="block text-xs text-suave">{r.tipo === 'receita' ? 'Receita' : 'Conta'} · todo dia {r.dia} · {formatarMoeda(r.valor)}{r.fim ? ` · até ${r.fim.split('-').reverse().join('/')}` : ''}</span>
                  </span>
                  <button type="button" onClick={() => setParando(r)} className="min-h-11 rounded-xl border border-borda-forte px-3 text-sm font-bold text-perigo-texto">Parar de repetir</button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="m-0 text-xs text-suave">Para mudar o valor ou o dia, toque na conta e escolha "neste e nos próximos meses".</p>
        <BotaoAgenda className="mt-2 self-start" />
        <p className="m-0 text-xs text-suave">A agenda do celular avisa 3 dias antes e no dia de cada vencimento.</p>
      </section>

      {parando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setParando(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-parar" onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl bg-cartao p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:w-[400px] sm:rounded-3xl">
            <h2 id="titulo-parar" className="m-0 text-lg font-extrabold">Parar de repetir "{parando.descricao}"?</h2>
            <p className="m-0 mt-2 text-sm">A conta deste mês continua. A partir do mês que vem ela não aparece mais (as já pagas ficam no histórico).</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setParando(null)} className="min-h-12 flex-1 rounded-xl border border-borda-forte font-bold">Cancelar</button>
              <button type="button" onClick={() => void confirmarParar()} className="min-h-12 flex-1 rounded-xl bg-perigo font-bold text-white">Parar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
