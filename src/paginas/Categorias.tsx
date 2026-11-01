import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { useCategorias } from '../hooks/useDados';
import { formatarMoeda } from '../utils/moeda';

// Lista de categorias (despesas e receitas). Tocar abre a edição.
export function Categorias() {
  const categorias = useCategorias();
  if (!categorias) return <p className="text-suave">Carregando…</p>;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Categorias</h1>
        <Link to="/categorias/nova" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline"><Plus size={18} aria-hidden="true" />Nova categoria</Link>
      </div>
      {(['despesa', 'receita'] as const).map((tipo) => (
        <section key={tipo} aria-labelledby={`titulo-${tipo}`} className="flex flex-col gap-2">
          <h2 id={`titulo-${tipo}`} className="m-0 text-sm font-extrabold text-suave">{tipo === 'despesa' ? 'Despesas' : 'Receitas'}</h2>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-borda bg-cartao p-0">
            {categorias.filter((c) => c.tipo === tipo).map((c) => (
              <li key={c.id} className="border-b border-borda last:border-b-0">
                <Link to={`/categorias/${c.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 text-tinta no-underline hover:bg-fundo">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: c.cor }}><IconeCategoria nome={c.icone} tamanho={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.nome}</span>
                    <span className="block truncate text-xs text-suave">{c.subcategorias.map((s) => s.nome).join(' · ') || 'sem subcategorias'}</span>
                  </span>
                  {tipo === 'despesa' && <span className="text-xs font-bold text-suave">{c.limiteMensal ? `limite ${formatarMoeda(c.limiteMensal)}` : 'sem limite'}</span>}
                  <ChevronRight size={18} aria-hidden="true" className="text-suave" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
