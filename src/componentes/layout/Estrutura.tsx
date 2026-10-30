import { BarChart3, Ellipsis, Heart, Landmark, PieChart, PiggyBank, Plus, Settings, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

// Estrutura de todas as telas (Layout C):
// - notebook: barra no topo com o menu e o botão "+ Lançar";
// - celular: menu escuro flutuante embaixo, com o "+" no meio e "Mais" para as outras telas.

const PRINCIPAIS = [
  { para: '/', texto: 'Visão geral', curto: 'Visão', Icone: PieChart },
  { para: '/lancamentos', texto: 'Lançamentos', curto: 'Lançamentos', Icone: ShoppingBag },
  { para: '/dividas', texto: 'Dívidas', curto: 'Dívidas', Icone: Landmark },
  { para: '/cofrinhos', texto: 'Cofrinhos', curto: 'Cofrinhos', Icone: PiggyBank },
  { para: '/desejos', texto: 'Desejos', curto: 'Desejos', Icone: Heart },
  { para: '/relatorios', texto: 'Relatórios', curto: 'Relatórios', Icone: BarChart3 },
];
const NO_MENU_CELULAR = ['/', '/dividas', '/cofrinhos'];
const NO_MAIS = [...PRINCIPAIS.filter((p) => !NO_MENU_CELULAR.includes(p.para)), { para: '/configuracoes', texto: 'Configurações', curto: 'Config.', Icone: Settings }];

function Logo() {
  return (
    <Link to="/" className="flex min-h-11 items-center gap-2.5 text-lg font-extrabold text-tinta no-underline">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primaria text-white"><PiggyBank size={20} aria-hidden="true" /></span>
      Nosso Dinheiro
    </Link>
  );
}

export function Estrutura({ children }: { children: ReactNode }) {
  const [maisAberto, setMaisAberto] = useState(false);
  const local = useLocation();
  // Na tela de lançar, o menu do celular some para dar lugar aos botões de salvar.
  const telaDeLancar = local.pathname.startsWith('/lancar');
  useEffect(() => setMaisAberto(false), [local.pathname]);
  useEffect(() => {
    if (!maisAberto) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setMaisAberto(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [maisAberto]);

  return (
    <div className="min-h-dvh bg-fundo">
      {import.meta.env.VITE_PREVIA === 'sim' && (
        <p className="m-0 bg-alerta-fundo px-4 py-2 text-center text-xs font-bold text-alerta-texto">
          Versão de teste: os dados ficam só neste navegador e não passam para o app publicado.
        </p>
      )}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-cartao focus:p-3">Pular para o conteúdo</a>

      {/* Topo — notebook */}
      <header className="hidden border-b border-borda bg-fundo md:block">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <Logo />
          <nav aria-label="Menu principal" className="flex flex-1 flex-wrap gap-0.5">
            {PRINCIPAIS.map(({ para, texto }) => (
              <NavLink key={para} to={para} end={para === '/'}
                className={({ isActive }) => `flex min-h-11 items-center border-b-[3px] px-3 text-sm no-underline ${isActive ? 'border-primaria font-extrabold text-tinta' : 'border-transparent font-semibold text-suave hover:text-tinta'}`}>
                {texto}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/configuracoes" aria-label="Configurações" className="flex h-11 w-11 items-center justify-center rounded-xl border border-borda-forte bg-cartao text-tinta">
            <Settings size={18} aria-hidden="true" />
          </NavLink>
          <Link to="/lancar" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline hover:bg-primaria-escura">
            <Plus size={18} strokeWidth={2.6} aria-hidden="true" />Lançar
          </Link>
        </div>
      </header>

      {/* Topo — celular */}
      <header className="flex items-center px-4 pt-3 md:hidden"><Logo /></header>

      <main id="conteudo" className={`mx-auto max-w-[1240px] px-4 pt-4 md:px-6 md:pb-12 md:pt-6 ${telaDeLancar ? 'pb-6' : 'pb-[calc(104px+env(safe-area-inset-bottom))]'}`}>{children}</main>

      {/* Menu inferior — celular: encostado na borda de baixo, na largura toda.
          A folga do iPhone (barra de gestos) é respeitada com safe-area-inset-bottom. */}
      <nav aria-label="Menu principal" hidden={telaDeLancar} className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around rounded-t-[22px] bg-menu pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(30,27,46,0.18)] md:hidden">
        <ItemMenuCelular {...PRINCIPAIS[0]} />
        <ItemMenuCelular {...PRINCIPAIS[2]} />
        <Link to="/lancar" aria-label="Novo lançamento" className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primaria text-white">
          <Plus size={26} strokeWidth={2.6} aria-hidden="true" />
        </Link>
        <ItemMenuCelular {...PRINCIPAIS[3]} />
        <button type="button" onClick={() => setMaisAberto(true)} aria-haspopup="dialog" aria-expanded={maisAberto}
          className="flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-menu-texto">
          <Ellipsis size={22} aria-hidden="true" />Mais
        </button>
      </nav>

      {maisAberto && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setMaisAberto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Mais opções" onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl bg-cartao p-4 pb-8">
            <div className="mb-2 flex items-center">
              <h2 className="m-0 flex-1 text-lg font-extrabold">Mais opções</h2>
              <button type="button" onClick={() => setMaisAberto(false)} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {NO_MAIS.map(({ para, texto, Icone }) => (
                <li key={para}>
                  <Link to={para} className="flex min-h-14 items-center gap-3 rounded-2xl border border-borda px-4 font-bold text-tinta no-underline">
                    <Icone size={20} aria-hidden="true" />{texto}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemMenuCelular({ para, curto, Icone }: (typeof PRINCIPAIS)[number]) {
  return (
    <NavLink to={para} end={para === '/'}
      className={({ isActive }) => `flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] no-underline ${isActive ? 'font-extrabold text-white' : 'font-semibold text-menu-texto'}`}>
      <Icone size={22} aria-hidden="true" />{curto}
    </NavLink>
  );
}
