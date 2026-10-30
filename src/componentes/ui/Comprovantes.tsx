import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Paperclip, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { banco } from '../../db/banco';
import { useAvisos } from '../../hooks/useAvisos';
import { formatarTamanho, removerComprovante, restaurarComprovante } from '../../servicos/comprovantes';
import type { ArquivoGuardado } from '../../tipos';

// Comprovantes (prints do Pix, fotos de recibos, PDFs) ligados a um depósito/saque do cofrinho.

/** Botão para escolher fotos/PDFs (no celular oferece câmera, galeria e arquivos). */
export function BotaoAnexar({ id, aoEscolher, texto = 'Anexar comprovante' }: { id: string; aoEscolher: (arquivos: File[]) => void; texto?: string }) {
  return (
    <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-primaria bg-primaria-clara px-3 text-sm font-bold text-primaria-escura focus-within:outline focus-within:outline-3 focus-within:outline-primaria">
      <Paperclip size={16} aria-hidden="true" />{texto}
      <input id={id} type="file" accept="image/*,application/pdf" multiple className="sr-only"
        onChange={(e) => { const lista = Array.from(e.target.files ?? []); e.target.value = ''; if (lista.length) aoEscolher(lista); }} />
    </label>
  );
}

/** Arquivos escolhidos que ainda vão ser salvos (com opção de tirar). */
export function ArquivosEscolhidos({ arquivos, aoRemover }: { arquivos: File[]; aoRemover: (i: number) => void }) {
  if (!arquivos.length) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" data-testid="arquivos-escolhidos">
      {arquivos.map((a, i) => (
        <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-fundo px-3 py-1">
          {/pdf/i.test(a.type) ? <FileText size={16} aria-hidden="true" /> : <Paperclip size={16} aria-hidden="true" />}
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <button type="button" onClick={() => aoRemover(i)} aria-label={`Tirar ${a.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-suave"><X size={16} aria-hidden="true" /></button>
        </li>
      ))}
    </ul>
  );
}

/** Miniaturas dos comprovantes já guardados; tocar abre em tela cheia. */
export function ListaComprovantes({ movimentoId, ids, descricao }: { movimentoId: number; ids: number[]; descricao: string }) {
  const arquivos = useLiveQuery(async () => (await banco.arquivos.bulkGet(ids)).filter((a): a is ArquivoGuardado => !!a), [ids.join(',')]);
  const [aberto, setAberto] = useState<ArquivoGuardado | null>(null);
  if (!arquivos?.length) return null;
  return (
    <>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={`Comprovantes: ${descricao}`} data-testid="comprovantes">
        {arquivos.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setAberto(a)} aria-label={`Ver comprovante ${a.nome}`} className="block h-16 w-16 overflow-hidden rounded-xl border border-borda bg-fundo">
              {a.tipo.startsWith('image/') ? <Miniatura arquivo={a} /> : <span className="flex h-full w-full flex-col items-center justify-center text-[10px] font-bold text-suave"><FileText size={22} aria-hidden="true" />PDF</span>}
            </button>
          </li>
        ))}
      </ul>
      {aberto && <Visualizador arquivo={aberto} movimentoId={movimentoId} aoFechar={() => setAberto(null)} />}
    </>
  );
}

function useUrl(dados: Blob) {
  const url = useMemo(() => URL.createObjectURL(dados), [dados]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

function Miniatura({ arquivo }: { arquivo: ArquivoGuardado }) {
  const url = useUrl(arquivo.dados);
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function Visualizador({ arquivo, movimentoId, aoFechar }: { arquivo: ArquivoGuardado; movimentoId: number; aoFechar: () => void }) {
  const url = useUrl(arquivo.dados);
  const { avisar } = useAvisos();
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aoFechar]);
  async function apagar() {
    const copia = await removerComprovante(movimentoId, arquivo.id!);
    aoFechar();
    if (copia) avisar('Comprovante apagado.', { rotulo: 'Desfazer', executar: () => void restaurarComprovante(movimentoId, copia) });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label={`Comprovante ${arquivo.nome}`} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-2xl flex-col gap-2 rounded-2xl bg-cartao p-3" data-testid="visualizador">
        <div className="flex items-center gap-2">
          <p className="m-0 min-w-0 flex-1 truncate text-sm font-bold">{arquivo.nome} <span className="font-normal text-suave">· {formatarTamanho(arquivo.tamanho)}</span></p>
          <button type="button" onClick={apagar} aria-label="Apagar comprovante" className="flex h-11 w-11 items-center justify-center rounded-xl text-perigo-texto"><Trash2 size={18} aria-hidden="true" /></button>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta"><X size={20} aria-hidden="true" /></button>
        </div>
        {arquivo.tipo.startsWith('image/') ? (
          <img src={url} alt={`Comprovante ${arquivo.nome}`} className="max-h-[75vh] w-full rounded-xl object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-fundo p-6">
            <FileText size={40} aria-hidden="true" className="text-primaria" />
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-primaria px-4 font-extrabold text-white no-underline">Abrir PDF</a>
          </div>
        )}
      </div>
    </div>
  );
}
