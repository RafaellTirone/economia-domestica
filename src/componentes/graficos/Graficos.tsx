import type { Centavos } from '../../tipos';
import { formatarMoeda } from '../../utils/moeda';

// Gráficos simples em SVG (sem biblioteca externa). Cada barra tem dica ao passar o mouse/tocar,
// e os valores importantes vêm escritos — a cor nunca é a única informação.

const CORES = { receitas: '#2a78d6', despesas: '#eb6834', unica: 'var(--color-primaria)' };
const abreviar = (c: Centavos) => (c >= 100000_00 ? `${Math.round(c / 100000)} mil` : c >= 1000_00 ? `${(c / 100000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `${Math.round(c / 100)}`);

/** Barras verticais de uma série (ex.: gasto por dia da semana). */
export function BarrasSimples({ dados, rotulo }: { dados: { rotulo: string; valor: Centavos; dica: string }[]; rotulo: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const L = 40, W = dados.length * L, H = 140;
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} width="100%" role="img" aria-label={rotulo} className="block max-h-56">
      <line x1="0" x2={W} y1={H} y2={H} stroke="var(--color-borda-forte)" />
      {dados.map((d, i) => {
        const h = (d.valor / max) * (H - 18);
        return (
          <g key={d.rotulo}>
            {d.valor > 0 && <rect x={i * L + 8} y={H - h} width={L - 16} height={h} rx="3" fill={CORES.unica}><title>{d.dica}</title></rect>}
            {d.valor > 0 && <text x={i * L + L / 2} y={H - h - 4} textAnchor="middle" fontSize="10" fill="var(--color-tinta)">{abreviar(d.valor)}</text>}
            <text x={i * L + L / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--color-suave)">{d.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontais (ex.: gastos por categoria), com nome, valor e % escritos. */
export function BarrasHorizontais({ dados }: { dados: { rotulo: string; valor: Centavos; percentual: number; cor: string }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {dados.map((d) => (
        <li key={d.rotulo} className="text-sm">
          <div className="flex gap-2"><span className="min-w-0 flex-1 truncate">{d.rotulo}</span><strong className="tabular-nums">{formatarMoeda(d.valor)}</strong><span className="w-12 text-right text-suave tabular-nums">{d.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span></div>
          <div className="mt-1 h-2.5 rounded-full bg-borda"><div className="h-2.5 rounded-full" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor }} title={`${d.rotulo}: ${formatarMoeda(d.valor)}`} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Receitas x despesas lado a lado por mês (12 meses). */
export function BarrasReceitasDespesas({ meses, rotulo }: { meses: { rotulo: string; receitas: Centavos; despesas: Centavos }[]; rotulo: string }) {
  const max = Math.max(1, ...meses.flatMap((m) => [m.receitas, m.despesas]));
  const L = 50, W = meses.length * L, H = 160, b = 15;
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-suave">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES.receitas }} />Receitas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES.despesas }} />Despesas</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label={rotulo} className="block">
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--color-borda-forte)" />
        {meses.map((m, i) => {
          const hr = (m.receitas / max) * (H - 8), hd = (m.despesas / max) * (H - 8);
          const x = i * L + (L - 2 * b - 2) / 2;
          return (
            <g key={m.rotulo}>
              {m.receitas > 0 && <rect x={x} y={H - hr} width={b} height={hr} rx="2" fill={CORES.receitas}><title>{m.rotulo} · Receitas {formatarMoeda(m.receitas)}</title></rect>}
              {m.despesas > 0 && <rect x={x + b + 2} y={H - hd} width={b} height={hd} rx="2" fill={CORES.despesas}><title>{m.rotulo} · Despesas {formatarMoeda(m.despesas)}</title></rect>}
              <text x={i * L + L / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--color-suave)">{m.rotulo}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
