import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnelProgresso } from '../componentes/ui/AnelProgresso';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { SeletorMes } from '../componentes/ui/SeletorMes';
import { banco } from '../db/banco';
import { useAvisos } from '../hooks/useAvisos';
import { useCategorias, useLancamentosDoMes, useTodosLancamentos } from '../hooks/useDados';
import { useMes } from '../hooks/useMes';
import { mediaMensal } from '../servicos/planejamento';
import { calcularResumo } from '../servicos/resumo';
import { formatarMesAno } from '../utils/datas';
import { formatarMoeda, formatarPercentual, lerValor } from '../utils/moeda';

// Orçamento do mês: limite de cada categoria, quanto já foi gasto e quanto falta.

const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TEXTO = { ok: 'text-ok-texto', atencao: 'text-alerta-texto', estourou: 'text-perigo-texto', 'sem-limite': 'text-suave' };

export function Orcamento() {
  const { ano, mes } = useMes();
  const categorias = useCategorias();
  const lancMes = useLancamentosDoMes(ano, mes);
  const todos = useTodosLancamentos();
  const { avisar } = useAvisos();
  const [editando, setEditando] = useState<Record<number, string>>({});
  const resumo = useMemo(() => (categorias && lancMes ? calcularResumo(lancMes, categorias) : null), [categorias, lancMes]);
  if (!resumo || !categorias || !todos) return <p className="text-suave">Carregando…</p>;
  const media = mediaMensal(todos);
  const totalLimites = categorias.filter((c) => c.tipo === 'despesa').reduce((s, c) => s + (c.limiteMensal ?? 0), 0);

  async function salvarLimite(id: number) {
    const texto = editando[id];
    if (texto === undefined) return;
    const valor = texto.trim() ? lerValor(texto) : null;
    if (texto.trim() && valor === null) { avisar('Valor inválido. Exemplo: 1.200,00'); return; }
    await banco.categorias.update(id, { limiteMensal: valor || null });
    setEditando(({ [id]: _, ...resto }) => resto);
    avisar(valor ? `Limite salvo: ${formatarMoeda(valor)}.` : 'Limite removido.');
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Orçamento</h1>
        <SeletorMes compacto />
      </div>
      <section className="flex flex-col gap-1 rounded-[22px] border border-borda bg-cartao p-4 text-sm">
        <p className="m-0">Defina quanto pode gastar por mês em cada categoria. O app avisa quando passar de <strong>80%</strong> e de <strong>100%</strong>.</p>
        {totalLimites > 0 && <p className="m-0 font-bold" data-testid="total-limites">Seus limites somam {formatarMoeda(totalLimites)}{media.receitas > 0 ? ` — ${formatarPercentual((totalLimites / media.receitas) * 100, 0)} da sua renda média (${formatarMoeda(media.receitas)})` : ''}.</p>}
      </section>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`Orçamento de ${formatarMesAno(ano, mes)}`}>
        {resumo.porCategoria.sort((a, b) => a.categoria.ordem - b.categoria.ordem).map(({ categoria: c, gasto, percentualDoLimite, situacao }) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-cartao p-3 ${situacao === 'estourou' ? 'border-2 border-status-perigo' : 'border border-borda'}`} data-testid={`orcamento-${c.nome}`}>
            <AnelProgresso percentual={percentualDoLimite} situacao={situacao} tamanho={46} rotulo={percentualDoLimite === null ? 'sem limite' : `${Math.round(percentualDoLimite)}% do limite`}><IconeCategoria nome={c.icone} tamanho={18} /></AnelProgresso>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-bold">{c.nome}</p>
              <p className={`m-0 text-xs font-bold ${TEXTO[situacao]}`}>
                {formatarMoeda(gasto)} gastos{c.limiteMensal ? ` de ${formatarMoeda(c.limiteMensal)} · ${formatarPercentual(percentualDoLimite!, 0)}${situacao === 'estourou' ? ` · passou ${formatarMoeda(gasto - c.limiteMensal)}` : ` · restam ${formatarMoeda(c.limiteMensal - gasto)}`}` : ''}
              </p>
            </div>
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void salvarLimite(c.id!); }}>
              <label htmlFor={`limite-${c.id}`} className="text-xs text-suave">Limite R$</label>
              <input id={`limite-${c.id}`} inputMode="decimal" placeholder="sem limite" value={editando[c.id!] ?? (c.limiteMensal ? paraCampo(c.limiteMensal) : '')}
                onChange={(e) => setEditando((x) => ({ ...x, [c.id!]: e.target.value.replace(/[^\d.,]/g, '') }))} onBlur={() => void salvarLimite(c.id!)}
                className="min-h-11 w-28 rounded-xl border border-borda-forte bg-cartao px-2 text-right text-base text-tinta" />
            </form>
          </li>
        ))}
      </ul>
      <Link to="/categorias" className="inline-flex min-h-11 items-center self-start font-bold text-primaria">Criar ou editar categorias</Link>
    </div>
  );
}
