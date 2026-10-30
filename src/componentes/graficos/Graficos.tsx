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
      <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" role="img" aria-label={rotulo} className="mx-auto block max-w-[680px]">
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--color-borda-forte)" />
        {meses.map((m, i) => {
          const hr = (m.receitas / max) * (H - 8), hd = (m.despesas / max) * (H - 8);
          const x = i * L + (L - 2 * b - 2) / 2;
          return (
            <g key={m.rotulo}>
              {m.receitas > 0 && <rect x={x} y={H - hr} width={b} height={hr} rx="2" fill={CORES.receitas}><title>{m.rotulo} · Receitas {formatarMoeda(m.receitas)}</title></rect>}
              {m.despesas > 0 && <rect x={x + b + 2} y={H - hd} width={b} height={hd} rx="2" fill={CORES.despesas}><title>{m.rotulo} · Despesas {formatarMoeda(m.despesas)}</title></rect>}
              <text x={i * L + L / 2} y={H + 22} textAnchor="middle" fontSize="17" fill="var(--color-suave)">{m.rotulo}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Outros formatos (o usuário escolhe em "Ver como") ----------

const CINZA_OUTRAS = '#8a8984';

/** Até 7 fatias + "Outras" (mais que isso fica impossível de distinguir as cores). */
export function agruparFatias<T extends { rotulo: string; valor: Centavos; cor: string }>(dados: T[], maximo = 7): { rotulo: string; valor: Centavos; cor: string }[] {
  if (dados.length <= maximo + 1) return dados;
  const resto = dados.slice(maximo).reduce((s, d) => s + d.valor, 0);
  return [...dados.slice(0, maximo), { rotulo: `Outras (${dados.length - maximo})`, valor: resto, cor: CINZA_OUTRAS }];
}

/** Pizza em forma de rosca, com legenda (nome, valor e %). */
export function Rosca({ dados, rotulo }: { dados: { rotulo: string; valor: Centavos; cor: string }[]; rotulo: string }) {
  const fatias = agruparFatias(dados);
  const total = fatias.reduce((s, d) => s + d.valor, 0) || 1;
  const R = 62, C = 80;
  let angulo = -90;
  const arcos = fatias.map((f) => {
    const graus = (f.valor / total) * 360;
    const ini = angulo + (fatias.length > 1 ? 0.8 : 0), fim = angulo + graus - (fatias.length > 1 ? 0.8 : 0);
    angulo += graus;
    const p = (a: number) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(ini), [x1, y1] = p(Math.min(fim, ini + 359.9));
    return { ...f, d: `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${fim - ini > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={rotulo} className="shrink-0" data-tipo-grafico="rosca">
        <g fill="none" strokeWidth="24">{arcos.map((a) => <path key={a.rotulo} d={a.d} stroke={a.cor}><title>{a.rotulo}: {formatarMoeda(a.valor)}</title></path>)}</g>
        <text x="80" y="76" textAnchor="middle" fontSize="11" fill="var(--color-suave)">Total</text>
        <text x="80" y="94" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-tinta)">{formatarMoeda(total)}</text>
      </svg>
      <ul className="m-0 flex min-w-[14rem] flex-1 list-none flex-col gap-1.5 p-0 text-sm">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: f.cor }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <strong className="tabular-nums">{formatarMoeda(f.valor)}</strong>
            <span className="w-10 text-right text-suave tabular-nums">{Math.round((f.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Linhas (uma ou mais séries), com pontos e legenda. */
export function Linhas({ rotulos, series, rotulo }: { rotulos: string[]; series: { nome: string; cor: string; valores: Centavos[] }[]; rotulo: string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const L = 46, W = Math.max(1, rotulos.length - 1) * L + 40, H = 150, x0 = 20;
  const letra = rotulos.length > 8 ? 16 : 11; // 12 meses: letras maiores para continuar legível no celular
  const y = (v: Centavos) => 10 + (1 - v / max) * (H - 20);
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex gap-4 text-xs text-suave">{series.map((s) => <span key={s.nome} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.cor }} />{s.nome}</span>)}</div>
      )}
      <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" role="img" aria-label={rotulo} className="mx-auto block max-h-64 max-w-[680px]" data-tipo-grafico="linhas">
        {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={10 + f * (H - 20)} y2={10 + f * (H - 20)} stroke="var(--color-borda)" />)}
        <text x="0" y="8" fontSize="10" fill="var(--color-suave)">{abreviar(max)}</text>
        {series.map((s) => (
          <g key={s.nome}>
            <polyline fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" points={s.valores.map((v, i) => `${x0 + i * L},${y(v)}`).join(' ')} />
            {s.valores.map((v, i) => <circle key={i} cx={x0 + i * L} cy={y(v)} r="4" fill={s.cor} stroke="var(--color-cartao)" strokeWidth="2"><title>{rotulos[i]} · {s.nome}: {formatarMoeda(v)}</title></circle>)}
          </g>
        ))}
        {rotulos.map((r, i) => <text key={r} x={x0 + i * L} y={H + 20} textAnchor="middle" fontSize={letra} fill="var(--color-suave)">{r}</text>)}
      </svg>
    </div>
  );
}

/** Saldo de cada mês: azul para cima quando sobrou, vermelho para baixo quando faltou. */
export function ColunasSaldo({ meses, rotulo }: { meses: { rotulo: string; saldo: Centavos }[]; rotulo: string }) {
  const max = Math.max(1, ...meses.map((m) => Math.abs(m.saldo)));
  const L = 50, W = meses.length * L, H = 180, meio = H / 2;
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-suave">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2a78d6]" />Sobrou</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#e34948]" />Faltou</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" role="img" aria-label={rotulo} className="mx-auto block max-w-[680px]" data-tipo-grafico="saldo">
        <line x1="0" x2={W} y1={meio} y2={meio} stroke="var(--color-borda-forte)" />
        {meses.map((m, i) => {
          const h = (Math.abs(m.saldo) / max) * (meio - 14);
          const positivo = m.saldo >= 0;
          return (
            <g key={m.rotulo}>
              {m.saldo !== 0 && <rect x={i * L + 12} y={positivo ? meio - h : meio} width={L - 24} height={h} rx="2" fill={positivo ? '#2a78d6' : '#e34948'}><title>{m.rotulo}: {positivo ? 'sobrou' : 'faltou'} {formatarMoeda(Math.abs(m.saldo))}</title></rect>}
              <text x={i * L + L / 2} y={H + 22} textAnchor="middle" fontSize="17" fill="var(--color-suave)">{m.rotulo}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Tabela simples (rótulo, valor e, se houver, %). */
export function TabelaValores({ linhas, colunas = ['Item', 'Valor'] }: { linhas: { rotulo: string; valores: string[] }[]; colunas?: string[] }) {
  return (
    <table className="w-full border-collapse text-sm" data-tipo-grafico="tabela">
      <thead><tr className="text-left text-xs text-suave">{colunas.map((c, i) => <th key={c} className={`py-1.5 ${i ? 'text-right' : ''}`}>{c}</th>)}</tr></thead>
      <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
        {linhas.map((l) => <tr key={l.rotulo} className="border-t border-borda"><td className="py-1.5 pr-2">{l.rotulo}</td>{l.valores.map((v, i) => <td key={i} className="py-1.5 pl-2 text-right whitespace-nowrap">{v}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

/** "Ver como": escolha do formato do gráfico. */
export function SeletorGrafico<T extends string>({ id, opcoes, valor, aoMudar }: { id: string; opcoes: readonly { valor: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label="Ver o gráfico como" id={id} className="flex flex-wrap items-center gap-1 print:hidden">
      <span className="mr-1 text-xs font-bold text-suave">Ver como:</span>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} onClick={() => aoMudar(o.valor)}
          className={`min-h-11 rounded-full px-3 text-xs ${valor === o.valor ? 'bg-tinta font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold text-tinta'}`}>{o.rotulo}</button>
      ))}
    </div>
  );
}
