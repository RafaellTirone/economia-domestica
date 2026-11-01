import { Camera, Check, ImageUp, Pencil, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analisarRecibo, type ResultadoRecibo } from '../../servicos/leitorRecibo';
import { cancelarLeitura, lerTexto, type Progresso } from '../../servicos/ocr';
import type { Centavos, DataISO } from '../../tipos';
import { formatarData } from '../../utils/datas';
import { formatarMoeda } from '../../utils/moeda';

// Foto do recibo: a pessoa tira (ou escolhe) a foto do cupom/comprovante, o app lê o texto
// NO APARELHO, acha o valor pago e PERGUNTA se está certo antes de preencher o lançamento.

export interface DadosDoRecibo {
  valor: Centavos;
  data: DataISO | null;
  descricao: string | null;
  sugestao: ResultadoRecibo['sugestao'];
  /** A pessoa quer ajustar o valor no formulário (o campo já abre selecionado). */
  corrigir?: boolean;
}

type Fase =
  | { tipo: 'escolher' }
  | { tipo: 'lendo'; progresso: Progresso }
  | { tipo: 'resultado'; r: ResultadoRecibo; texto: string }
  | { tipo: 'erro'; mensagem: string };

const ETAPAS: Record<Progresso['etapa'], string> = {
  preparando: 'Preparando a foto…',
  carregando: 'Abrindo o leitor (na primeira vez, baixa uns 5 MB)…',
  lendo: 'Lendo o recibo…',
};

export function FotoRecibo({ aoUsar, aoFechar }: { aoUsar: (d: DadosDoRecibo) => void; aoFechar: () => void }) {
  const [fase, setFase] = useState<Fase>({ tipo: 'escolher' });
  const [foto, setFoto] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<Centavos | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const vez = useRef(0);

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto); }, [foto]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { setFase({ tipo: 'erro', mensagem: 'Escolha uma foto (imagem). Para PDF de contrato, use a tela de Dívidas.' }); return; }
    const minha = ++vez.current;
    setFoto(URL.createObjectURL(arquivo));
    setFase({ tipo: 'lendo', progresso: { etapa: 'preparando', fracao: 0 } });
    try {
      const texto = await lerTexto(arquivo, (p) => { if (vez.current === minha) setFase({ tipo: 'lendo', progresso: p }); });
      if (vez.current !== minha) return;
      const r = analisarRecibo(texto);
      setEscolhido(r.valor);
      setFase({ tipo: 'resultado', r, texto });
    } catch {
      if (vez.current !== minha) return;
      setFase({ tipo: 'erro', mensagem: navigator.onLine
        ? 'Não consegui abrir o leitor de fotos neste aparelho. Tente de novo ou digite o valor.'
        : 'Sem internet: na primeira vez, o leitor de fotos precisa ser baixado (uns 5 MB). Conecte e tente de novo — depois funciona sem internet.' });
    }
  }

  function fechar() {
    if (fase.tipo === 'lendo') { vez.current++; void cancelarLeitura(); }
    aoFechar();
  }

  function deNovo() {
    vez.current++;
    setFase({ tipo: 'escolher' });
    setEscolhido(null);
  }

  function confirmar(r: ResultadoRecibo) {
    if (escolhido === null) return;
    aoUsar({ valor: escolhido, data: r.data, descricao: r.estabelecimento, sugestao: r.sugestao });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label="Foto do recibo" onClick={(e) => e.stopPropagation()} data-testid="foto-recibo"
        className="flex max-h-[100dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-fundo p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl sm:w-[440px] sm:rounded-3xl">
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-base font-extrabold">Foto do recibo</h2>
          <button type="button" onClick={fechar} aria-label="Fechar foto do recibo" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta"><X size={20} aria-hidden="true" /></button>
        </div>

        {/* Entradas escondidas: câmera direto e galeria/arquivos */}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden="true" tabIndex={-1} data-testid="entrada-camera"
          onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={galeria} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} data-testid="entrada-galeria"
          onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ''; }} />

        {fase.tipo === 'escolher' && (
          <>
            <p className="m-0 text-sm">Fotografe o <b>cupom fiscal</b>, o <b>comprovante do cartão</b> ou o <b>print do Pix</b>. O app procura o valor pago e pergunta se está certo antes de lançar.</p>
            <ul className="m-0 list-disc pl-5 text-sm text-suave">
              <li>Com boa luz, sem sombra e com o recibo reto.</li>
              <li>Pegue a parte do <b>total</b> ("Valor a pagar").</li>
              <li>A foto é lida aqui no aparelho e não vai para a internet.</li>
            </ul>
            <button type="button" onClick={() => camera.current?.click()} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white">
              <Camera size={22} aria-hidden="true" />Tirar foto
            </button>
            <button type="button" onClick={() => galeria.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primaria bg-cartao px-4 font-extrabold text-primaria-escura">
              <ImageUp size={20} aria-hidden="true" />Escolher foto ou print da galeria
            </button>
          </>
        )}

        {foto && fase.tipo !== 'escolher' && (
          <img src={foto} alt="Foto do recibo escolhida" className="max-h-56 w-full rounded-2xl border border-borda bg-cartao object-contain" />
        )}

        {fase.tipo === 'lendo' && (
          <div aria-live="polite" data-testid="lendo-recibo">
            <p className="m-0 text-sm font-bold">{ETAPAS[fase.progresso.etapa]}</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-borda" role="progressbar" aria-label="Lendo o recibo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fase.progresso.fracao * 100)}>
              <div className="h-full rounded-full bg-primaria transition-[width]" style={{ width: `${Math.max(5, fase.progresso.fracao * 100)}%` }} />
            </div>
            <button type="button" onClick={deNovo} className="mt-3 min-h-11 w-full rounded-xl border border-borda-forte font-bold">Cancelar</button>
          </div>
        )}

        {fase.tipo === 'erro' && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="m-0 font-bold text-perigo-texto">{fase.mensagem}</p>
            <button type="button" onClick={deNovo} className="min-h-12 rounded-xl border-2 border-primaria font-bold text-primaria-escura">Tentar de novo</button>
          </div>
        )}

        {fase.tipo === 'resultado' && (fase.r.valor === null ? (
          <div className="flex flex-col gap-2" data-testid="resultado-recibo">
            <p className="m-0 font-bold">Não encontrei o valor nesta foto.</p>
            <p className="m-0 text-sm text-suave">Tente outra foto mais de perto, com boa luz e o recibo reto — ou feche e digite o valor.</p>
            {fase.texto.trim() && (
              <details className="text-sm">
                <summary className="flex min-h-11 cursor-pointer items-center font-bold text-primaria">Ver o texto que o app leu</summary>
                <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-cartao p-2 text-xs" data-testid="texto-lido">{fase.texto}</pre>
              </details>
            )}
            <button type="button" onClick={deNovo} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primaria font-extrabold text-white"><RotateCcw size={18} aria-hidden="true" />Tirar outra foto</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="resultado-recibo">
            <div className="rounded-2xl border border-borda bg-cartao p-3">
              <p className="m-0 text-sm text-suave">Encontrei o valor pago:</p>
              <p className="m-0 text-3xl font-extrabold tabular-nums" data-testid="valor-lido">{formatarMoeda(escolhido ?? fase.r.valor)}</p>
              <p className="m-0 text-xs text-suave">Da linha: “{fase.r.candidatos.find((c) => c.valor === escolhido)?.linha ?? ''}”</p>
              <p className={`m-0 mt-1 text-xs font-bold ${fase.r.confianca === 'alta' ? 'text-ok-texto' : 'text-alerta-texto'}`}>
                {fase.r.confianca === 'alta' ? 'Achei a linha do total. Confira com o recibo.' : 'Não tenho certeza: confira com o recibo antes de confirmar.'}
              </p>
              {(fase.r.estabelecimento || fase.r.data) && (
                <p className="m-0 mt-2 text-sm">{[fase.r.estabelecimento, fase.r.data && formatarData(fase.r.data)].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            {fase.r.candidatos.length > 1 && (
              <div>
                <p className="m-0 mb-1.5 text-sm font-bold" id="outros-valores">Não é esse? Toque no valor certo:</p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="outros-valores">
                  {fase.r.candidatos.map((c) => (
                    <button key={c.valor} type="button" aria-pressed={c.valor === escolhido} onClick={() => setEscolhido(c.valor)}
                      className={`min-h-11 rounded-full px-3.5 text-sm tabular-nums ${c.valor === escolhido ? 'bg-primaria font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold text-tinta'}`}>
                      {formatarMoeda(c.valor)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-bold text-primaria">Ver o texto que o app leu</summary>
              <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-cartao p-2 text-xs" data-testid="texto-lido">{fase.texto}</pre>
            </details>
            <p className="m-0 text-base font-extrabold">O valor {formatarMoeda(escolhido ?? 0)} está certo?</p>
            <button type="button" onClick={() => confirmar(fase.r)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white">
              <Check size={22} aria-hidden="true" />Sim, usar este valor
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => { if (escolhido !== null) aoUsar({ valor: escolhido, data: fase.r.data, descricao: fase.r.estabelecimento, sugestao: fase.r.sugestao, corrigir: true }); }}
                className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-borda-forte bg-cartao font-bold"><Pencil size={16} aria-hidden="true" />Corrigir no formulário</button>
              <button type="button" onClick={deNovo} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-borda-forte bg-cartao font-bold"><RotateCcw size={16} aria-hidden="true" />Outra foto</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
