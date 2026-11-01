import { Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAvisos } from '../hooks/useAvisos';
import { apagarExemplos, apagarTudo, carregarExemplos, useTemExemplos } from '../servicos/exemplos';

// Configurações → dados de exemplo (carregar / apagar só eles) e "Apagar tudo".

export function SecaoDados() {
  const temExemplos = useTemExemplos();
  const { avisar } = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [palavra, setPalavra] = useState('');

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    if (ocupado) return;
    setOcupado(true);
    try { await acao(); avisar(mensagem); } finally { setOcupado(false); }
  }

  return (
    <section aria-labelledby="titulo-dados" className="rounded-[22px] border border-borda bg-cartao p-5">
      <h2 id="titulo-dados" className="m-0 text-lg font-extrabold">Dados de exemplo e limpeza</h2>
      <p className="m-0 mt-1 text-sm text-suave">Os exemplos mostram uma casa fictícia com 4 meses de uso. Eles ficam marcados e saem com um toque, sem apagar o que é seu.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {temExemplos ? (
          <button type="button" disabled={ocupado} onClick={() => void executar(apagarExemplos, 'Dados de exemplo apagados. O que é seu continua aqui.')}
            className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-primaria px-4 font-bold text-primaria-escura">
            <Trash2 size={18} aria-hidden="true" />Apagar só os dados de exemplo
          </button>
        ) : (
          <button type="button" disabled={ocupado || temExemplos === undefined} onClick={() => void executar(() => carregarExemplos(), 'Dados de exemplo carregados. Dá para apagar só eles depois, aqui mesmo.')}
            className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-primaria px-4 font-bold text-primaria-escura">
            <Sparkles size={18} aria-hidden="true" />Carregar dados de exemplo
          </button>
        )}
        {!confirmando && (
          <button type="button" onClick={() => setConfirmando(true)} className="flex min-h-11 items-center gap-2 rounded-xl border border-perigo-texto px-4 font-bold text-perigo-texto">
            <Trash2 size={18} aria-hidden="true" />Apagar tudo
          </button>
        )}
      </div>
      {confirmando && (
        <form className="mt-3 flex flex-col gap-2 rounded-2xl border-2 border-perigo-texto p-3" aria-label="Confirmar apagar tudo"
          onSubmit={(e) => { e.preventDefault(); if (palavra.trim().toUpperCase() !== 'APAGAR') return; void executar(apagarTudo, 'Tudo apagado. O app voltou ao começo.').then(() => { setConfirmando(false); setPalavra(''); }); }}>
          <p className="m-0 text-sm font-bold text-perigo-texto">Isso apaga TODOS os lançamentos, contas, dívidas, contratos, cofrinhos, desejos e a chave Pix deste aparelho. Não dá para desfazer. Faça um backup antes.</p>
          <label htmlFor="confirma-apagar" className="text-sm">Para confirmar, digite <b>APAGAR</b>:</label>
          <input id="confirma-apagar" value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" className="min-h-12 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta" />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setConfirmando(false); setPalavra(''); }} className="min-h-11 flex-1 rounded-xl border border-borda-forte font-bold">Cancelar</button>
            <button type="submit" disabled={palavra.trim().toUpperCase() !== 'APAGAR' || ocupado} className="min-h-11 flex-1 rounded-xl bg-perigo font-bold text-white disabled:opacity-50">Apagar tudo</button>
          </div>
        </form>
      )}
    </section>
  );
}
