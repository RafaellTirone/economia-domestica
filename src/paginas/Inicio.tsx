import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarrasReceitasDespesas, ColunasSaldo } from '../componentes/graficos/Graficos';
import { AnelProgresso } from '../componentes/ui/AnelProgresso';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { SeletorMes } from '../componentes/ui/SeletorMes';
import { useCategorias, useEmprestimos, useLancamentosDoMes, useTodosLancamentos } from '../hooks/useDados';
import { ItemLancamento } from './Lancamentos';
import { useMes } from '../hooks/useMes';
import { itensDeAtencao, paraOndeFoi, type ItemAtencao } from '../servicos/atencao';
import { useUltimoBackup } from '../servicos/backup';
import { useRegraSalario } from '../servicos/configuracoes';
import { resumirEmprestimo } from '../servicos/emprestimos';
import { contasDoMes, useRecorrencias } from '../servicos/recorrencias';
import { relatorioAnual } from '../servicos/relatorios';
import { calcularResumo, type ResumoCategoria } from '../servicos/resumo';
import { formatarMesAno, montarData, nomeDoMes } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';

// Tela inicial (Visão geral): o que precisa de atenção hoje, para onde foi o dinheiro do mês,
// as contas do mês, os envelopes de cada categoria e como está o ano.

export function Inicio() {
  const { ano, mes, hoje } = useMes();
  const categorias = useCategorias();
  const lancamentos = useLancamentosDoMes(ano, mes);
  const todos = useTodosLancamentos();
  const recorrencias = useRecorrencias();
  const resumo = useMemo(() => (categorias && lancamentos ? calcularResumo(lancamentos, categorias) : null), [categorias, lancamentos]);
  const divisao = useMemo(() => (categorias && lancamentos ? paraOndeFoi(lancamentos, categorias) : null), [categorias, lancamentos]);
  const contas = useMemo(
    () => (todos && recorrencias ? contasDoMes(todos, recorrencias, montarData(ano, mes, 1).slice(0, 7), hoje) : null),
    [todos, recorrencias, ano, mes, hoje],
  );
  const anual = useMemo(() => (todos && categorias ? relatorioAnual(todos, categorias, ano) : null), [todos, categorias, ano]);

  if (!resumo || !divisao) return <p className="text-suave">Carregando…</p>;
  const vazio = lancamentos!.length === 0;
  const contasPagas = contas?.filter((c) => c.paga).reduce((s, c) => s + c.valor, 0) ?? 0;
  const contasTotal = contas?.reduce((s, c) => s + c.valor, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-xl font-extrabold first-letter:uppercase md:text-2xl">{formatarMesAno(ano, mes)}</h1>
        <SeletorMes compacto />
      </div>

      <Atencao />

      <section aria-labelledby="titulo-renda" className="rounded-[22px] border border-borda bg-cartao p-5 md:p-6">
        <h2 id="titulo-renda" className="m-0 text-sm font-semibold text-suave">Entraram</h2>
        <p className="m-0 text-3xl font-extrabold">{formatarMoeda(resumo.receitas)}</p>
        {vazio ? (
          <div className="mt-4 rounded-2xl bg-primaria-clara p-4 text-sm text-[#2E2860]">
            <p className="m-0 font-bold">Ainda não há lançamentos neste mês.</p>
            <p className="m-0 mt-1">Use o botão <strong>+</strong> para lançar receitas e despesas. A divisão do seu dinheiro aparece aqui.</p>
          </div>
        ) : (
          <dl className="m-0 mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Valor rotulo="Despesas" valor={formatarMoeda(resumo.despesas)} />
            <Valor rotulo="Saldo" valor={formatarMoeda(resumo.saldo)} />
            <Valor rotulo="Guardado" valor={formatarMoeda(resumo.guardado)} />
            <Valor rotulo="Economizado" valor={resumo.percentualEconomizado === null ? '—' : formatarPercentual(resumo.percentualEconomizado)} />
          </dl>
        )}
        {divisao.fatias.length > 0 && <ParaOndeFoi {...divisao} />}
      </section>

      {contas && contas.length > 0 && (
        <Link to="/contas" className="flex min-h-14 items-center gap-3 rounded-[22px] border border-borda bg-cartao p-4 text-tinta no-underline hover:bg-primaria-clara" data-testid="resumo-contas-inicio">
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold">Contas do mês</span>
            <span className="block text-sm text-suave">Pagas {formatarMoeda(contasPagas)} de {formatarMoeda(contasTotal)} · {contas.filter((c) => !c.paga).length} a pagar</span>
          </span>
          <span className="h-2.5 w-24 overflow-hidden rounded-full bg-borda" aria-hidden="true"><span className="block h-full rounded-full bg-status-ok" style={{ width: `${contasTotal ? (contasPagas / contasTotal) * 100 : 0}%` }} /></span>
        </Link>
      )}

      <section aria-labelledby="titulo-envelopes">
        <div className="mb-2.5 flex items-baseline">
          <h2 id="titulo-envelopes" className="m-0 text-lg font-extrabold">Envelopes do mês</h2>
          <Link to="/orcamento" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold text-primaria no-underline">Definir limites</Link>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {resumo.porCategoria.map((rc) => <Envelope key={rc.categoria.id} {...rc} />)}
        </ul>
      </section>

      {!vazio && (
        <section aria-labelledby="titulo-ultimos">
          <div className="mb-2.5 flex items-baseline">
            <h2 id="titulo-ultimos" className="m-0 text-lg font-extrabold">Últimos lançamentos</h2>
            <Link to="/lancamentos" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold text-primaria no-underline">Ver todos</Link>
          </div>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-borda bg-cartao p-0">
            {[...lancamentos!].sort((a, b) => b.data.localeCompare(a.data) || (b.id ?? 0) - (a.id ?? 0)).slice(0, 5)
              .map((l) => <ItemLancamento key={l.id} l={l} categoria={categorias!.find((c) => c.id === l.categoriaId)} />)}
          </ul>
        </section>
      )}

      {anual && anual.mesesComDados > 0 && (
        <section aria-labelledby="titulo-ano" className="rounded-[22px] border border-borda bg-cartao p-5" data-testid="resumo-ano">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
            <h2 id="titulo-ano" className="m-0 text-lg font-extrabold">Seu {ano}</h2>
            <p className="m-0 text-sm font-bold">
              {anual.economizado >= 0 ? `Sobrou ${formatarMoeda(anual.economizado)} no ano` : `Faltou ${formatarMoeda(-anual.economizado)} no ano`}
              {anual.guardado > 0 ? ` · guardou ${formatarMoeda(anual.guardado)}` : ''}
            </p>
            <Link to="/relatorios" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold text-primaria no-underline">Relatórios</Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="m-0 mb-2 text-sm font-bold text-suave">Entrou x saiu, mês a mês</h3>
              <BarrasReceitasDespesas rotulo={`Receitas e despesas de cada mês de ${ano}`} meses={anual.meses.map((m) => ({ rotulo: nomeDoMes(m.mes).slice(0, 3), receitas: m.receitas, despesas: m.despesas }))} />
            </div>
            <div>
              <h3 className="m-0 mb-2 text-sm font-bold text-suave">Quanto sobrou ou faltou</h3>
              <ColunasSaldo rotulo={`Quanto sobrou ou faltou em cada mês de ${ano}`} meses={anual.meses.map((m) => ({ rotulo: nomeDoMes(m.mes).slice(0, 3), saldo: m.saldo }))} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const ESTILO_NIVEL = {
  perigo: { Icone: OctagonAlert, classe: 'border-status-perigo bg-perigo-fundo text-perigo-texto' },
  alerta: { Icone: AlertTriangle, classe: 'border-status-alerta bg-alerta-fundo text-alerta-texto' },
  info: { Icone: Info, classe: 'border-borda bg-primaria-clara text-[#2E2860]' },
};

/** "Precisa da sua atenção": vale para HOJE, qualquer que seja o mês escolhido. */
function Atencao() {
  const { hoje } = useMes();
  const categorias = useCategorias();
  const todos = useTodosLancamentos();
  const dados = useEmprestimos();
  const regra = useRegraSalario();
  const ultimoBackup = useUltimoBackup();
  const itens = useMemo<ItemAtencao[] | null>(() => {
    if (!categorias || !todos || !dados || ultimoBackup === undefined || regra === undefined) return null;
    const emprestimos = dados.map((d) => resumirEmprestimo(d.emprestimo, d.pagamentos, hoje, regra)).filter((r) => r.status !== 'quitado');
    return itensDeAtencao({ hoje, lancamentos: todos, categorias, emprestimos, ultimoBackup });
  }, [categorias, todos, dados, regra, ultimoBackup, hoje]);
  if (!itens) return null;
  if (itens.length === 0) {
    if (todos!.length === 0) return null;
    return <p className="m-0 flex items-center gap-2 text-sm font-bold text-ok-texto" data-testid="atencao"><CheckCircle2 size={18} aria-hidden="true" />Tudo em dia por aqui.</p>;
  }
  return (
    <section aria-labelledby="titulo-atencao" data-testid="atencao">
      <h2 id="titulo-atencao" className="m-0 mb-2 text-lg font-extrabold">Precisa da sua atenção</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {itens.map((i) => {
          const { Icone, classe } = ESTILO_NIVEL[i.nivel];
          return (
            <li key={i.texto} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border p-3 ${classe}`}>
              <Icone size={20} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 text-sm font-bold">{i.texto}</span>
              <Link to={i.link} className="inline-flex min-h-11 items-center rounded-xl bg-cartao px-3 text-sm font-extrabold text-tinta no-underline">{i.rotuloLink}</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Barra única com o que entrou dividido em gastos, guardado e sobra (a legenda traz os valores). */
function ParaOndeFoi({ fatias, base, passou }: ReturnType<typeof paraOndeFoi>) {
  const descricao = fatias.map((f) => `${f.rotulo} ${formatarMoeda(f.valor)}`).join(', ');
  return (
    <div className="mt-4" data-testid="para-onde-foi">
      <h3 className="m-0 mb-2 text-sm font-bold text-suave">Para onde foi o dinheiro</h3>
      <div className="flex h-5 overflow-hidden rounded-full bg-borda" role="img" aria-label={`Para onde foi o dinheiro: ${descricao}`}>
        {fatias.map((f) => (
          <span key={f.rotulo} className="block h-full border-r-2 border-cartao last:border-r-0" style={{ width: `${(f.valor / base) * 100}%`, background: f.cor }} title={`${f.rotulo}: ${formatarMoeda(f.valor)}`} />
        ))}
      </div>
      <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 text-sm sm:grid-cols-2">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: f.cor }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <strong className="tabular-nums">{formatarMoeda(f.valor)}</strong>
            <span className="w-10 text-right text-suave tabular-nums">{Math.round((f.valor / base) * 100)}%</span>
          </li>
        ))}
      </ul>
      {passou > 0 && <p className="m-0 mt-2 text-sm font-bold text-perigo-texto">Saiu {formatarMoeda(passou)} a mais do que entrou neste mês.</p>}
    </div>
  );
}

function Valor({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-fundo p-3">
      <dt className="text-xs font-semibold text-suave">{rotulo}</dt>
      <dd className="m-0 font-extrabold">{valor}</dd>
    </div>
  );
}

const TEXTO_SITUACAO = { ok: 'text-ok-texto', atencao: 'text-alerta-texto', estourou: 'text-perigo-texto', 'sem-limite': 'text-suave' };

function Envelope({ categoria, gasto, percentualDoLimite, situacao }: ResumoCategoria) {
  const detalhe = situacao === 'sem-limite' ? 'sem limite definido'
    : `${formatarPercentual(percentualDoLimite!, 0)} do limite${situacao === 'estourou' ? ' · estourou' : situacao === 'atencao' ? ' · atenção' : ''}`;
  return (
    <li>
      <Link to={`/lancamentos?categoria=${categoria.id}`} aria-label={`${categoria.nome}: ${formatarMoeda(gasto)}, ${detalhe}. Ver lançamentos`}
        className={`flex h-full items-center gap-3 rounded-2xl bg-cartao p-3 text-tinta no-underline hover:bg-primaria-clara ${situacao === 'estourou' ? 'border-2 border-status-perigo' : 'border border-borda'}`}>
      <AnelProgresso percentual={percentualDoLimite} situacao={situacao} tamanho={46} rotulo={detalhe}>
        <IconeCategoria nome={categoria.icone} tamanho={18} />
      </AnelProgresso>
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-bold leading-tight">{categoria.nome}</p>
        <p className="m-0 text-[15px] font-extrabold">{formatarMoeda(gasto)}</p>
        <p className={`m-0 text-xs font-bold ${TEXTO_SITUACAO[situacao]}`}>{detalhe}</p>
      </div>
      </Link>
    </li>
  );
}
