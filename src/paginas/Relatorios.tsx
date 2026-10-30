import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { BarrasHorizontais, BarrasReceitasDespesas, BarrasSimples } from '../componentes/graficos/Graficos';
import { useCategorias, useCofrinhos, useTodosLancamentos } from '../hooks/useDados';
import { resumirCofrinho } from '../servicos/cofrinhos';
import { baixarArquivo, gerarCsv, linhasLancamentos, relatorioAnual, relatorioMensal, relatorioSemanal, type FatiaCategoria } from '../servicos/relatorios';
import type { Categoria, Lancamento } from '../tipos';
import { adicionarDias, formatarData, formatarDiaMes, formatarMesAno, hojeISO, partesDaData } from '../utils/datas';
import { formatarMoeda, formatarMoedaComSinal, formatarPercentual } from '../utils/moeda';

// Relatórios semanal, mensal e anual, com gráficos, tabelas, planilha (CSV/Excel) e PDF (imprimir).

type Aba = 'semanal' | 'mensal' | 'anual';
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function Relatorios() {
  const lancamentos = useTodosLancamentos();
  const categorias = useCategorias();
  const cofrinhos = useCofrinhos();
  const hoje = hojeISO();
  const [aba, setAba] = useState<Aba>('mensal');
  const [diaSemana, setDiaSemana] = useState(hoje);
  const [mesRef, setMesRef] = useState(partesDaData(hoje));
  const [ano, setAno] = useState(partesDaData(hoje).ano);

  const semanal = useMemo(() => (lancamentos && categorias ? relatorioSemanal(lancamentos, categorias, diaSemana) : null), [lancamentos, categorias, diaSemana]);
  const mensal = useMemo(() => (lancamentos && categorias ? relatorioMensal(lancamentos, categorias, mesRef.ano, mesRef.mes) : null), [lancamentos, categorias, mesRef]);
  const anual = useMemo(() => (lancamentos && categorias ? relatorioAnual(lancamentos, categorias, ano) : null), [lancamentos, categorias, ano]);
  if (!semanal || !mensal || !anual || !categorias || !cofrinhos) return <p className="text-suave">Carregando…</p>;

  const moverMes = (d: number) => setMesRef(({ ano: a, mes: m }) => { const t = a * 12 + m - 1 + d; return { ano: Math.floor(t / 12), mes: (t % 12) + 1, dia: 1 }; });
  const periodo = aba === 'semanal' ? `${formatarData(semanal.inicio)} a ${formatarData(semanal.fim)}` : aba === 'mensal' ? formatarMesAno(mensal.ano, mensal.mes) : String(ano);
  const anterior = () => (aba === 'semanal' ? setDiaSemana(adicionarDias(diaSemana, -7)) : aba === 'mensal' ? moverMes(-1) : setAno(ano - 1));
  const proximo = () => (aba === 'semanal' ? setDiaSemana(adicionarDias(diaSemana, 7)) : aba === 'mensal' ? moverMes(1) : setAno(ano + 1));

  function baixarPlanilha() {
    if (aba === 'anual') {
      const linhas = [['Mês', 'Receitas (R$)', 'Despesas (R$)', 'Saldo (R$)', 'Guardado (R$)'], ...anual!.meses.map((m) => [formatarMesAno(ano, m.mes), m.receitas, m.despesas, m.saldo, m.guardado]),
        ['Total', anual!.receitas, anual!.despesas, anual!.economizado, anual!.guardado]];
      baixarArquivo(`relatorio-anual-${ano}.csv`, gerarCsv(linhas));
    } else {
      const lista = aba === 'semanal' ? semanal!.lancamentos : mensal!.lancamentos;
      const nome = aba === 'semanal' ? `relatorio-semanal-${semanal!.inicio}.csv` : `relatorio-mensal-${mensal!.ano}-${String(mensal!.mes).padStart(2, '0')}.csv`;
      baixarArquivo(nome, gerarCsv(linhasLancamentos(lista, categorias!)));
    }
  }

  const fatiasParaGrafico = (f: FatiaCategoria[]) => f.map((x) => ({ rotulo: x.categoria?.nome ?? 'Sem categoria', valor: x.valor, percentual: x.percentual, cor: x.categoria?.cor ?? '#8a8984' }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Relatórios</h1>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={baixarPlanilha} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte bg-cartao px-3 text-sm font-bold text-tinta"><FileSpreadsheet size={18} aria-hidden="true" />Planilha (Excel)</button>
          <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte bg-cartao px-3 text-sm font-bold text-tinta"><Printer size={18} aria-hidden="true" />PDF</button>
        </div>
      </div>

      <div role="radiogroup" aria-label="Tipo de relatório" className="flex rounded-2xl bg-borda p-1 print:hidden">
        {(['semanal', 'mensal', 'anual'] as const).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={aba === a} onClick={() => setAba(a)}
            className={`min-h-11 flex-1 rounded-xl text-sm font-extrabold ${aba === a ? 'bg-cartao text-tinta shadow' : 'text-suave'}`}>{a === 'semanal' ? 'Semanal' : a === 'mensal' ? 'Mensal' : 'Anual'}</button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-borda bg-cartao p-1">
        <button type="button" onClick={anterior} aria-label="Período anterior" className="flex h-11 w-11 items-center justify-center rounded-xl print:hidden"><ChevronLeft size={20} aria-hidden="true" /></button>
        <p className="m-0 text-center font-extrabold first-letter:uppercase" data-testid="periodo-relatorio">{aba === 'semanal' ? 'Semana de ' : ''}{periodo}</p>
        <button type="button" onClick={proximo} aria-label="Próximo período" className="flex h-11 w-11 items-center justify-center rounded-xl print:hidden"><ChevronRight size={20} aria-hidden="true" /></button>
      </div>

      {aba === 'semanal' && (
        <>
          <Numeros itens={[
            ['Gastos da semana', formatarMoeda(semanal.despesas)],
            ['Semana anterior', formatarMoeda(semanal.despesasSemanaAnterior)],
            ['Comparação', semanal.variacao === null ? '—' : `${semanal.variacao > 0 ? '+' : ''}${formatarPercentual(semanal.variacao)}`],
          ]} />
          {semanal.variacao !== null && <p className={`m-0 text-sm font-bold ${semanal.variacao > 0 ? 'text-perigo-texto' : 'text-ok-texto'}`} data-testid="comparacao-semana">{semanal.variacao > 0 ? `Você gastou ${formatarMoeda(semanal.despesas - semanal.despesasSemanaAnterior)} a mais que na semana anterior.` : `Você gastou ${formatarMoeda(semanal.despesasSemanaAnterior - semanal.despesas)} a menos que na semana anterior.`}</p>}
          <Bloco titulo="Gasto por dia">
            <BarrasSimples rotulo="Gasto por dia da semana" dados={semanal.porDia.map((d, i) => ({ rotulo: `${DIAS[i]} ${formatarDiaMes(d.data).slice(0, 2)}`, valor: d.valor, dica: `${formatarData(d.data)}: ${formatarMoeda(d.valor)}` }))} />
          </Bloco>
          <Bloco titulo="Categorias que mais pesaram">{semanal.categorias.length ? <BarrasHorizontais dados={fatiasParaGrafico(semanal.categorias.slice(0, 5))} /> : <Vazio />}</Bloco>
          <Bloco titulo="Lançamentos da semana"><TabelaLancamentos lista={semanal.lancamentos} categorias={categorias} /></Bloco>
        </>
      )}

      {aba === 'mensal' && (
        <>
          <Numeros itens={[
            ['Receitas', formatarMoeda(mensal.receitas)], ['Despesas', formatarMoeda(mensal.despesas)], ['Saldo', formatarMoeda(mensal.saldo)],
            ['Economizado', mensal.percentualEconomizado === null ? '—' : formatarPercentual(mensal.percentualEconomizado)], ['Guardado em cofrinhos', formatarMoeda(mensal.guardado)],
          ]} />
          <Bloco titulo="Comparação com o mês anterior">
            <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px] whitespace-nowrap sm:text-sm" data-testid="comparacao-mes">
              <thead><tr className="text-left text-xs text-suave"><th className="py-1.5 pr-1"></th><th className="px-1 py-1.5 text-right">Este mês</th><th className="px-1 py-1.5 text-right">Anterior</th><th className="py-1.5 pl-1 text-right">Diferença</th></tr></thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {([['Receitas', mensal.receitas, mensal.anterior.receitas], ['Despesas', mensal.despesas, mensal.anterior.despesas], ['Saldo', mensal.saldo, mensal.anterior.saldo]] as const).map(([n, a, b]) => (
                  <tr key={n} className="border-t border-borda"><td className="py-2 pr-1 font-bold">{n}</td><td className="px-1 py-2 text-right">{formatarMoeda(a)}</td><td className="px-1 py-2 text-right">{formatarMoeda(b)}</td><td className="py-2 pl-1 text-right">{formatarMoedaComSinal(a - b)}</td></tr>
                ))}
              </tbody>
            </table></div>
          </Bloco>
          <Bloco titulo="Gastos por categoria">{mensal.categorias.length ? <BarrasHorizontais dados={fatiasParaGrafico(mensal.categorias)} /> : <Vazio />}</Bloco>
          <Bloco titulo="Cumprimento do orçamento">
            {mensal.orcamento.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">{mensal.orcamento.map((o) => <li key={o.categoria.id}>{o.categoria.nome}: {formatarMoeda(o.gasto)} de {formatarMoeda(o.limite)} ({formatarPercentual(o.percentual, 0)}) {o.percentual > 100 ? '— estourou' : o.percentual >= 80 ? '— atenção' : '— ok'}</li>)}</ul>
            ) : <p className="m-0 text-sm text-suave">Os limites por categoria chegam na etapa de orçamento; quando definidos, aparecem aqui.</p>}
          </Bloco>
          <Bloco titulo="Maiores despesas"><TabelaLancamentos lista={mensal.maioresDespesas} categorias={categorias} /></Bloco>
          <Bloco titulo="Todos os lançamentos do mês"><TabelaLancamentos lista={mensal.lancamentos} categorias={categorias} /></Bloco>
        </>
      )}

      {aba === 'anual' && (
        <>
          <Numeros itens={[
            ['Receitas no ano', formatarMoeda(anual.receitas)], ['Despesas no ano', formatarMoeda(anual.despesas)], ['Economizado no ano', formatarMoeda(anual.economizado)],
            ['Média de gastos por mês', formatarMoeda(anual.mediaGastosMes)], ['Guardado em cofrinhos', formatarMoeda(anual.guardado)],
          ]} />
          <Bloco titulo="Mês a mês"><BarrasReceitasDespesas rotulo={`Receitas e despesas de ${ano}, mês a mês`} meses={anual.meses.map((m) => ({ rotulo: MESES_CURTOS[m.mes - 1], receitas: m.receitas, despesas: m.despesas }))} /></Bloco>
          <Bloco titulo="Tabela do ano">
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] border-collapse text-sm whitespace-nowrap" data-testid="tabela-anual">
              <thead><tr className="text-left text-xs text-suave"><th className="px-2 py-1.5">Mês</th><th className="px-2 py-1.5 text-right">Receitas</th><th className="px-2 py-1.5 text-right">Despesas</th><th className="px-2 py-1.5 text-right">Saldo</th><th className="px-2 py-1.5 text-right">Guardado</th></tr></thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {anual.meses.map((m) => <tr key={m.mes} className="border-t border-borda"><td className="px-2 py-1.5">{MESES_CURTOS[m.mes - 1]}</td><td className="px-2 py-1.5 text-right">{formatarMoeda(m.receitas)}</td><td className="px-2 py-1.5 text-right">{formatarMoeda(m.despesas)}</td><td className="px-2 py-1.5 text-right">{formatarMoeda(m.saldo)}</td><td className="px-2 py-1.5 text-right">{formatarMoeda(m.guardado)}</td></tr>)}
                <tr className="border-t-2 border-tinta font-extrabold"><td className="px-2 py-2">Total</td><td className="px-2 py-2 text-right">{formatarMoeda(anual.receitas)}</td><td className="px-2 py-2 text-right">{formatarMoeda(anual.despesas)}</td><td className="px-2 py-2 text-right">{formatarMoeda(anual.economizado)}</td><td className="px-2 py-2 text-right">{formatarMoeda(anual.guardado)}</td></tr>
              </tbody>
            </table></div>
          </Bloco>
          <Bloco titulo="Gastos por categoria no ano">{anual.categorias.length ? <BarrasHorizontais dados={fatiasParaGrafico(anual.categorias)} /> : <Vazio />}</Bloco>
          <Bloco titulo="Maiores despesas do ano"><TabelaLancamentos lista={anual.maioresDespesas} categorias={categorias} /></Bloco>
          <Bloco titulo="Evolução das metas (cofrinhos)">
            {cofrinhos.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm" data-testid="metas-ano">
                {cofrinhos.map((c) => { const r = resumirCofrinho(c.cofrinho, c.movimentos); return <li key={c.cofrinho.id} className="flex flex-wrap gap-x-2">{c.cofrinho.nome}: <strong>{formatarMoeda(r.saldo)}</strong> de {formatarMoeda(c.cofrinho.meta)} ({formatarPercentual(r.percentual, 0)})</li>; })}
              </ul>
            ) : <p className="m-0 text-sm text-suave">Nenhum cofrinho ainda.</p>}
          </Bloco>
        </>
      )}
    </div>
  );
}

function Numeros({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" data-testid="numeros-relatorio">
      {itens.map(([r, v]) => <div key={r} className="rounded-2xl border border-borda bg-cartao p-3"><dt className="text-xs font-semibold text-suave">{r}</dt><dd className="m-0 text-lg font-extrabold">{v}</dd></div>)}
    </dl>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section aria-label={titulo} className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4 break-inside-avoid md:p-5"><h2 className="m-0 text-base font-extrabold">{titulo}</h2>{children}</section>;
}

function Vazio() {
  return <p className="m-0 text-sm text-suave">Sem lançamentos neste período.</p>;
}

function TabelaLancamentos({ lista, categorias }: { lista: Lancamento[]; categorias: Categoria[] }) {
  if (!lista.length) return <Vazio />;
  const porId = new Map(categorias.map((c) => [c.id, c]));
  return (
    <table className="w-full border-collapse text-sm">
      <thead><tr className="text-left text-xs text-suave"><th className="py-1.5 pr-2">Data</th><th className="py-1.5 pr-2">Descrição</th><th className="py-1.5 text-right">Valor</th></tr></thead>
      <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
        {lista.map((l) => (
          <tr key={l.id} className="border-t border-borda align-top">
            <td className="py-2 pr-2 whitespace-nowrap">{formatarDiaMes(l.data)}</td>
            <td className="py-2 pr-2 break-words">
              <span className="block">{l.descricao || porId.get(l.categoriaId)?.nome}</span>
              <span className="block text-xs text-suave">{l.tipo === 'guardado' ? 'Cofrinho' : porId.get(l.categoriaId)?.nome ?? '—'}</span>
            </td>
            <td className={`py-2 text-right font-bold whitespace-nowrap ${l.tipo === 'receita' ? 'text-ok-texto' : ''}`}>{formatarMoedaComSinal(l.tipo === 'receita' ? l.valor : -l.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
