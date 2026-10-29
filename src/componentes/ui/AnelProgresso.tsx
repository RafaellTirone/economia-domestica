import type { ReactNode } from 'react';

// Anel de progresso do envelope (gasto ÷ limite). A cor mostra a situação,
// mas o texto ao lado sempre diz o percentual — a cor nunca é a única informação.

const CORES = { ok: 'var(--color-status-ok)', atencao: 'var(--color-status-alerta)', estourou: 'var(--color-status-perigo)', 'sem-limite': 'var(--color-borda-forte)' };

export function AnelProgresso({ percentual, situacao, tamanho = 52, rotulo, children }: {
  percentual: number | null;
  situacao: keyof typeof CORES;
  tamanho?: number;
  rotulo: string;
  children?: ReactNode;
}) {
  const raio = 20;
  const circ = 2 * Math.PI * raio;
  const preenchido = percentual === null ? 0 : Math.min(percentual, 100) / 100 * circ;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox="0 0 52 52" role="img" aria-label={rotulo} className="absolute inset-0">
        <circle cx="26" cy="26" r={raio} fill="none" stroke="var(--color-borda)" strokeWidth="6" />
        {preenchido > 0 && (
          <circle cx="26" cy="26" r={raio} fill="none" stroke={CORES[situacao]} strokeWidth="6"
            strokeLinecap={percentual! >= 100 ? 'butt' : 'round'} strokeDasharray={`${preenchido} ${circ}`} transform="rotate(-90 26 26)" />
        )}
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
