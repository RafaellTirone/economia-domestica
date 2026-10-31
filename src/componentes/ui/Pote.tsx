// Pote do cofrinho: enche conforme o progresso (e mostra quanto vai encher com um depósito).
export function Pote({ percentual, depois, tamanho = 64 }: { percentual: number; depois?: number; tamanho?: number }) {
  const altura = 83; // área útil interna (y de 14 a 97)
  const y = (p: number) => 97 - (Math.min(100, Math.max(0, p)) / 100) * altura;
  return (
    <svg width={tamanho} height={tamanho * 1.4} viewBox="0 0 74 104" role="img" aria-label={`Cofrinho ${Math.round(percentual)}% cheio`} className="shrink-0">
      <rect x="16" y="2" width="42" height="10" rx="4" fill="var(--color-borda-forte)" />
      <rect x="4" y="12" width="66" height="90" rx="16" fill="var(--color-primaria-clara)" stroke="var(--color-primaria)" strokeWidth="2.5" />
      {depois !== undefined && depois > percentual && <rect x="9" y={y(depois)} width="56" height={y(percentual) - y(depois)} fill="#A9A1EC" />}
      {percentual > 0 && <rect x="9" y={y(percentual)} width="56" height={97 - y(percentual)} rx={percentual > 8 ? 10 : 2} fill="var(--color-primaria)" />}
    </svg>
  );
}
