import { Delete, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Categoria } from '../../tipos';
import { calcular, emCentavos, formatarNumero, OPERACOES, type Operacao } from '../../utils/calculadora';
import { formatarMoeda } from '../../utils/moeda';
import { IconeCategoria } from './IconeCategoria';

// Calculadora do lançamento: faz as contas da compra (itens, quilo, desconto) e, no "Finalizar",
// manda o resultado para o lugar escolhido (ex.: Alimentação › Açougue), preenchendo o valor.

/** Número para continuar a conta: sem separador de milhar, com vírgula. */
const paraExpressao = (n: number) => String(Math.round(n * 1e6) / 1e6).replace('.', ',');

export function Calculadora({ inicial, categoria, subcategoriaId, aoEscolherSub, aoFinalizar, aoFechar }: {
  /** Valor que já estava no campo (centavos), para continuar a conta a partir dele. */
  inicial: number | null;
  categoria?: Categoria;
  subcategoriaId?: string;
  aoEscolherSub: (id: string | undefined) => void;
  aoFinalizar: (centavos: number) => void;
  aoFechar: () => void;
}) {
  const [expr, setExpr] = useState(inicial ? paraExpressao(inicial / 100) : '');
  const [fita, setFita] = useState<string[]>([]);
  /** Depois do "=", digitar um número começa uma conta nova. */
  const [mostrandoResultado, setMostrandoResultado] = useState(false);
  const fitaRef = useRef<HTMLOListElement>(null);
  const resultado = calcular(expr);
  const centavos = resultado !== null ? emCentavos(resultado) : null;
  const podeFinalizar = centavos !== null && centavos > 0;
  const sub = categoria?.subcategorias.find((s) => s.id === subcategoriaId);
  const destino = categoria ? `${categoria.nome}${sub ? ` › ${sub.nome}` : ''}` : null;

  function digito(d: string) {
    setExpr((e) => (mostrandoResultado ? d : e + d));
    setMostrandoResultado(false);
  }
  function virgula() {
    setExpr((e) => {
      const base = mostrandoResultado ? '' : e;
      const atual = base.split(/[\s+−×÷]/).pop() ?? '';
      if (atual.includes(',') || atual.includes('%')) return base;
      return base + (atual === '' ? '0,' : ',');
    });
    setMostrandoResultado(false);
  }
  function operacao(op: Operacao) {
    setExpr((e) => {
      const t = e.trimEnd();
      if (!t) return op === '−' ? '− ' : '';
      if (OPERACOES.includes(t.slice(-1) as Operacao)) return `${t.slice(0, -1).trimEnd()} ${op} `;
      return `${t.replace(/,$/, '')} ${op} `;
    });
    setMostrandoResultado(false);
  }
  function porcento() {
    setExpr((e) => (/\d,?$/.test(e) ? e.replace(/,$/, '') + '%' : e));
    setMostrandoResultado(false);
  }
  function apagar() {
    setExpr((e) => {
      const t = e.trimEnd();
      if (/[+−×÷]$/.test(t)) return t.slice(0, -1).trimEnd(); // tira a operação
      return t.slice(0, -1); // tira o último dígito (mantém o espaço depois da operação)
    });
    setMostrandoResultado(false);
  }
  function igual() {
    if (resultado === null || centavos === null || mostrandoResultado) return;
    // Conta de dinheiro: o "=" fecha em centavos, como na etiqueta (1,250 kg × 42,90 = 53,63)
    const fechado = centavos / 100;
    setFita((f) => [...f, `${expr.trim()} = ${formatarNumero(fechado)}`]);
    setExpr(paraExpressao(fechado));
    setMostrandoResultado(true);
  }
  function finalizar() {
    if (!podeFinalizar) return;
    aoFinalizar(centavos);
  }

  // Teclado do computador também funciona
  const acoes = useRef({ digito, virgula, operacao, porcento, apagar, igual, finalizar, aoFechar });
  acoes.current = { digito, virgula, operacao, porcento, apagar, igual, finalizar, aoFechar };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const a = acoes.current;
      if (/^\d$/.test(e.key)) a.digito(e.key);
      else if (e.key === ',' || e.key === '.') a.virgula();
      else if (e.key === '+') a.operacao('+');
      else if (e.key === '-') a.operacao('−');
      else if (e.key === '*' || e.key === 'x') a.operacao('×');
      else if (e.key === '/') a.operacao('÷');
      else if (e.key === '%') a.porcento();
      else if (e.key === 'Backspace') a.apagar();
      else if (e.key === '=' || e.key === 'Enter') { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'BUTTON') return; a.igual(); }
      else if (e.key === 'Escape') a.aoFechar();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => { fitaRef.current?.scrollTo({ top: fitaRef.current.scrollHeight }); }, [fita]);

  const tecla = 'flex h-14 items-center justify-center rounded-2xl text-xl font-bold active:scale-95';
  const num = `${tecla} border border-borda bg-cartao text-tinta`;
  const op = `${tecla} bg-primaria-clara text-[28px] text-primaria-escura`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label="Calculadora" onClick={(e) => e.stopPropagation()} data-testid="calculadora"
        className="flex max-h-[100dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-fundo p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl sm:w-[400px] sm:rounded-3xl">
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-base font-extrabold">Calculadora</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar calculadora" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta"><X size={20} aria-hidden="true" /></button>
        </div>

        {/* Para onde vai o resultado */}
        {categoria ? (
          <div>
            <p className="m-0 mb-1.5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: categoria.cor }}><IconeCategoria nome={categoria.icone} tamanho={15} /></span>
              Vai para: {destino}
            </p>
            {categoria.subcategorias.length > 0 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Escolher o detalhe">
                {categoria.subcategorias.map((s) => (
                  <button key={s.id} type="button" aria-pressed={s.id === subcategoriaId} onClick={() => aoEscolherSub(s.id === subcategoriaId ? undefined : s.id)}
                    className={`min-h-11 shrink-0 rounded-full px-3 text-sm ${s.id === subcategoriaId ? 'bg-primaria font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold text-tinta'}`}>{s.nome}</button>
                ))}
              </div>
            )}
          </div>
        ) : <p className="m-0 text-sm text-suave">Dica: escolha a categoria antes (ex.: Alimentação › Açougue) para o resultado ir direto para ela.</p>}

        {/* Visor: contas já feitas, conta atual e resultado */}
        <div className="rounded-2xl border border-borda bg-cartao p-3">
          {fita.length > 0 && (
            <ol ref={fitaRef} className="m-0 mb-1 max-h-20 list-none overflow-y-auto p-0 text-right text-sm text-suave tabular-nums" aria-label="Contas feitas">
              {fita.map((f, i) => <li key={i}>{f}</li>)}
            </ol>
          )}
          <p className="m-0 min-h-7 break-all text-right text-xl font-semibold tabular-nums" data-testid="calc-expressao">{expr || '0'}</p>
          <p className="m-0 text-right text-3xl font-extrabold tabular-nums" aria-live="polite" data-testid="calc-resultado">
            {resultado === null ? (expr ? '…' : 'R$ 0,00') : `= ${formatarMoeda(centavos!)}`}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => { setExpr(''); setFita([]); setMostrandoResultado(false); }} className={`${tecla} bg-borda text-tinta`} aria-label="Limpar tudo">C</button>
          <button type="button" onClick={apagar} className={`${tecla} bg-borda text-tinta`} aria-label="Apagar o último"><Delete size={22} aria-hidden="true" /></button>
          <button type="button" onClick={porcento} className={op} aria-label="Porcentagem">%</button>
          <button type="button" onClick={() => operacao('÷')} className={op} aria-label="Dividir">÷</button>
          {['7', '8', '9'].map((d) => <button key={d} type="button" onClick={() => digito(d)} className={num}>{d}</button>)}
          <button type="button" onClick={() => operacao('×')} className={op} aria-label="Multiplicar">×</button>
          {['4', '5', '6'].map((d) => <button key={d} type="button" onClick={() => digito(d)} className={num}>{d}</button>)}
          <button type="button" onClick={() => operacao('−')} className={op} aria-label="Menos">−</button>
          {['1', '2', '3'].map((d) => <button key={d} type="button" onClick={() => digito(d)} className={num}>{d}</button>)}
          <button type="button" onClick={() => operacao('+')} className={op} aria-label="Mais">+</button>
          <button type="button" onClick={() => digito('0')} className={`${num} col-span-2`}>0</button>
          <button type="button" onClick={virgula} className={num} aria-label="Vírgula">,</button>
          <button type="button" onClick={igual} className={`${tecla} bg-tinta text-white`} aria-label="Igual">=</button>
        </div>

        <button type="button" onClick={finalizar} disabled={!podeFinalizar}
          className="min-h-14 rounded-2xl bg-primaria px-3 text-base font-extrabold text-white disabled:bg-borda disabled:text-suave">
          {podeFinalizar ? `Finalizar: ${formatarMoeda(centavos!)}${destino ? ` em ${sub?.nome ?? categoria!.nome}` : ''}` : 'Finalizar'}
        </button>
      </div>
    </div>
  );
}
