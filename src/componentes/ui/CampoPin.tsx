// Campo de PIN (6 números, escondido). O PIN nunca é guardado.
export function CampoPin({ id, rotulo, valor, aoMudar }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{rotulo}</label>
      <input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={valor}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="min-h-14 w-full max-w-60 rounded-xl border-2 border-borda-forte bg-cartao px-4 text-center text-2xl tracking-[0.5em] text-tinta focus:border-primaria" />
    </div>
  );
}
