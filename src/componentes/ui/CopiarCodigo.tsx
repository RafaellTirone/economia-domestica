import { Copy } from 'lucide-react';
import { useState } from 'react';

// Pix "copia e cola": botão de copiar + o código visível (selecionável) caso a cópia não funcione.
export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      document.getElementById('codigo-pix')?.focus();
    }
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <button type="button" onClick={copiar} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primaria bg-cartao px-4 font-extrabold text-primaria-escura">
        <Copy size={18} aria-hidden="true" />{copiado ? 'Código copiado!' : 'Copiar código Pix'}
      </button>
      <label htmlFor="codigo-pix" className="sr-only">Código Pix copia e cola</label>
      <textarea id="codigo-pix" readOnly rows={3} value={codigo} onFocus={(e) => e.target.select()}
        className="w-full rounded-xl border border-borda bg-fundo p-2 font-mono text-[11px] break-all text-suave" data-testid="codigo-pix" />
    </div>
  );
}
