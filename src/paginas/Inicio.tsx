import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnelProgresso } from '../componentes/ui/AnelProgresso';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { SeletorMes } from '../componentes/ui/SeletorMes';
import { useCategorias, useLancamentosDoMes } from '../hooks/useDados';
import { useMes } from '../hooks/useMes';
import { calcularResumo, type ResumoCategoria } from '../servicos/resumo';
import { formatarMesAno } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';

// Tela inicial (Visão geral): para onde foi o dinheiro do mês e os envelopes de cada categoria.

export function Inicio() {
  const { ano, mes } = useMes();
  const categorias = useCategorias();
  const lancamentos = useLancamentosDoMes(ano, mes);
  const resumo = useMemo(() => (categorias && lancamentos ? calcularResumo(lancamentos, categorias) : null), [categorias, lancamentos]);

  if (!resumo) return <p className="text-suave">Carregando…</p>;
  const vazio = lancamentos!.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-xl font-extrabold first-letter:uppercase md:text-2xl">{formatarMesAno(ano, mes)}</h1>
        <SeletorMes compacto />
      </div>

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
      </section>

      <section aria-labelledby="titulo-envelopes">
        <div className="mb-2.5 flex items-baseline">
          <h2 id="titulo-envelopes" className="m-0 text-lg font-extrabold">Envelopes do mês</h2>
          <Link to="/gastos" className="ml-auto inline-flex min-h-11 items-center text-sm font-bold text-primaria no-underline">Definir limites</Link>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {resumo.porCategoria.map((rc) => <Envelope key={rc.categoria.id} {...rc} />)}
        </ul>
      </section>
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
    <li className={`flex items-center gap-3 rounded-2xl bg-cartao p-3 ${situacao === 'estourou' ? 'border-2 border-status-perigo' : 'border border-borda'}`}>
      <AnelProgresso percentual={percentualDoLimite} situacao={situacao} tamanho={46} rotulo={detalhe}>
        <IconeCategoria nome={categoria.icone} tamanho={18} />
      </AnelProgresso>
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-bold leading-tight">{categoria.nome}</p>
        <p className="m-0 text-[15px] font-extrabold">{formatarMoeda(gasto)}</p>
        <p className={`m-0 text-xs font-bold ${TEXTO_SITUACAO[situacao]}`}>{detalhe}</p>
      </div>
    </li>
  );
}
