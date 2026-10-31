import { PiggyBank, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CampoData } from '../componentes/ui/CampoData';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { NOMES_FORMAS } from '../componentes/ui/rotulos';
import { SeletorMes } from '../componentes/ui/SeletorMes';
import { useCategorias, useTodosLancamentos } from '../hooks/useDados';
import { useMes } from '../hooks/useMes';
import { filtrarLancamentos, totais, type Filtros } from '../servicos/lancamentos';
import type { Categoria, Lancamento } from '../tipos';
import { formatarData, limitesDoMes, nomeDoDia } from '../utils/datas';
import { formatarMoeda, formatarMoedaComSinal } from '../utils/moeda';

// Lista de lançamentos com busca e filtros por período, tipo e categoria.

export function Lancamentos() {
  const { ano, mes } = useMes();
  const [params, setParams] = useSearchParams();
  const categorias = useCategorias();
  const todos = useTodosLancamentos();

  const [personalizado, setPersonalizado] = useState(false);
  const mesLimites = limitesDoMes(ano, mes);
  const [inicio, setInicio] = useState(mesLimites.inicio);
  const [fim, setFim] = useState(mesLimites.fim);
  const [busca, setBusca] = useState('');
  const tipo = (params.get('tipo') as Filtros['tipo']) || 'todos';
  const categoriaId = params.get('categoria') ? Number(params.get('categoria')) : null;

  function mudarParam(nome: string, valor: string | null) {
    const p = new URLSearchParams(params);
    if (valor) p.set(nome, valor); else p.delete(nome);
    setParams(p, { replace: true });
  }

  const filtros: Filtros = {
    inicio: personalizado ? inicio : mesLimites.inicio,
    fim: personalizado ? fim : mesLimites.fim,
    tipo, categoriaId, busca,
  };
  const lista = todos && categorias ? filtrarLancamentos(todos, filtros, categorias) : null;
  const soma = lista ? totais(lista) : null;
  const porId = new Map(categorias?.map((c) => [c.id!, c]));

  // Agrupa por dia
  const dias = useMemo(() => {
    const grupos: { data: string; itens: Lancamento[] }[] = [];
    for (const l of lista ?? []) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.data === l.data) ultimo.itens.push(l); else grupos.push({ data: l.data, itens: [l] });
    }
    return grupos;
  }, [lista]);

  const filtrosAtivos = tipo !== 'todos' || categoriaId !== null || busca.trim() !== '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Lançamentos</h1>
        {!personalizado && <SeletorMes compacto />}
        <Link to="/lancar" className="hidden min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline md:flex">
          <Plus size={18} aria-hidden="true" />Lançar
        </Link>
      </div>

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4">
        <div className="flex items-center gap-2 rounded-xl border border-borda-forte px-3 focus-within:border-primaria">
          <Search size={18} aria-hidden="true" className="text-suave" />
          <label htmlFor="busca" className="sr-only">Buscar</label>
          <input id="busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por descrição, categoria…"
            className="min-h-11 w-full min-w-0 border-0 bg-transparent text-base text-tinta outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="radiogroup" aria-label="Tipo" className="flex rounded-xl bg-fundo p-1">
            {([['todos', 'Todos'], ['despesa', 'Despesas'], ['receita', 'Receitas']] as const).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => mudarParam('tipo', v === 'todos' ? null : v)}
                className={`min-h-11 rounded-lg px-3 text-sm ${tipo === v ? 'bg-cartao font-extrabold text-tinta shadow' : 'font-semibold text-suave'}`}>{t}</button>
            ))}
          </div>
          <label htmlFor="filtro-categoria" className="sr-only">Categoria</label>
          <select id="filtro-categoria" value={categoriaId ?? ''} onChange={(e) => mudarParam('categoria', e.target.value || null)}
            className="min-h-11 min-w-0 flex-1 basis-full rounded-xl border border-borda-forte bg-cartao px-3 text-sm font-semibold text-tinta sm:basis-48">
            <option value="">Todas as categorias</option>
            {categorias?.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.tipo === 'receita' ? ' (receita)' : ''}</option>)}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={personalizado} onChange={(e) => { setPersonalizado(e.target.checked); setInicio(mesLimites.inicio); setFim(mesLimites.fim); }} className="h-5 w-5 accent-primaria" />
          Escolher outro período
        </label>
        {personalizado && (
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-1 flex-col gap-1 text-sm font-bold"><span>De</span><CampoData id="filtro-inicio" rotulo="De" valor={inicio} aoMudar={setInicio} /></div>
            <div className="flex flex-1 flex-col gap-1 text-sm font-bold"><span>Até</span><CampoData id="filtro-fim" rotulo="Até" valor={fim} aoMudar={setFim} /></div>
          </div>
        )}
        {filtrosAtivos && (
          <button type="button" onClick={() => { setBusca(''); setParams(new URLSearchParams(), { replace: true }); }}
            className="min-h-11 self-start rounded-xl px-2 text-sm font-bold text-primaria">Limpar filtros</button>
        )}
      </section>

      {/* Totais */}
      {soma && (
        <dl className="m-0 grid grid-cols-3 gap-2 text-sm" aria-label="Totais do período">
          <div className="rounded-xl bg-cartao p-3"><dt className="text-xs font-semibold text-suave">Receitas</dt><dd className="m-0 font-extrabold text-ok-texto">{formatarMoeda(soma.receitas)}</dd></div>
          <div className="rounded-xl bg-cartao p-3"><dt className="text-xs font-semibold text-suave">Despesas</dt><dd className="m-0 font-extrabold text-perigo-texto">{formatarMoeda(soma.despesas)}</dd></div>
          <div className="rounded-xl bg-cartao p-3"><dt className="text-xs font-semibold text-suave">Saldo</dt><dd className="m-0 font-extrabold">{formatarMoeda(soma.receitas - soma.despesas)}</dd></div>
        </dl>
      )}

      {/* Lista */}
      {!lista ? <p className="text-suave">Carregando…</p> : lista.length === 0 ? (
        <div className="rounded-[22px] border border-borda bg-cartao p-6 text-center">
          <p className="m-0 font-bold">{filtrosAtivos ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento neste período.'}</p>
          <Link to="/lancar" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline">
            <Plus size={18} aria-hidden="true" />Fazer um lançamento
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="lista-lancamentos">
          <p className="m-0 text-sm text-suave">{lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'}</p>
          {dias.map(({ data, itens }) => (
            <section key={data} aria-label={formatarData(data)}>
              <h2 className="m-0 mb-1.5 text-xs font-extrabold uppercase tracking-wide text-suave">{nomeDoDia(data)} · {formatarData(data)}</h2>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-borda bg-cartao p-0">
                {itens.map((l) => <ItemLancamento key={l.id} l={l} categoria={porId.get(l.categoriaId)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemLancamento({ l, categoria }: { l: Lancamento; categoria?: Categoria }) {
  const sub = categoria?.subcategorias.find((s) => s.id === l.subcategoriaId)?.nome;
  const titulo = l.descricao || sub || categoria?.nome || 'Lançamento';
  const cofrinho = l.tipo === 'guardado';
  const detalhes = cofrinho ? ['Cofrinho · não conta como despesa'] : [categoria ? (sub ? `${categoria.nome} › ${sub}` : categoria.nome) : 'Sem categoria', NOMES_FORMAS[l.forma]];
  if (l.parcela) detalhes.push(`parcela ${l.parcela.numero} de ${l.parcela.total}`);
  if (l.fixa) detalhes.push('fixa');
  const sinal = l.tipo === 'receita' ? l.valor : -l.valor;
  return (
    <li className="border-b border-borda last:border-b-0">
      {/* Depósitos/saques de cofrinho são editados no próprio cofrinho */}
      <Link to={cofrinho ? '/cofrinhos' : `/lancar/${l.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 text-tinta no-underline hover:bg-fundo">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: cofrinho ? 'var(--color-primaria)' : categoria?.cor ?? '#8a8984' }}>
          {cofrinho ? <PiggyBank size={18} aria-hidden="true" /> : categoria && <IconeCategoria nome={categoria.icone} tamanho={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{titulo}</span>
          <span className="block truncate text-xs text-suave">{detalhes.join(' · ')}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={`font-extrabold ${l.tipo === 'receita' ? 'text-ok-texto' : ''}`}>{formatarMoedaComSinal(sinal)}</span>
          {l.situacao === 'a_pagar' && <span className="rounded-md bg-alerta-fundo px-1.5 text-[11px] font-bold text-alerta-texto">{l.tipo === 'receita' ? 'a receber' : 'a pagar'}</span>}
        </span>
      </Link>
    </li>
  );
}
