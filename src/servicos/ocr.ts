import type { Worker as LeitorTesseract } from 'tesseract.js';

// Leitura de texto em imagens (OCR) feita NO APARELHO, com o Tesseract em WebAssembly.
// - A foto nunca sai do celular: o motor e o português vêm do próprio site (/ocr/) só no primeiro uso
//   e depois ficam guardados (funciona sem internet).
// - Roda num "worker" separado: a tela não trava enquanto lê.
// - Antes de ler, a foto é endireitada (EXIF), reduzida e passada para tons de cinza com contraste.

export interface Progresso { etapa: 'preparando' | 'carregando' | 'lendo'; fracao: number }

let leitor: Promise<LeitorTesseract> | null = null;
let desligar: ReturnType<typeof setTimeout> | undefined;
let avisar: ((p: Progresso) => void) | null = null;

async function obterLeitor(): Promise<LeitorTesseract> {
  clearTimeout(desligar);
  leitor ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const w = await createWorker('por', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr',
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (!avisar) return;
        if (m.status === 'recognizing text') avisar({ etapa: 'lendo', fracao: m.progress });
        else avisar({ etapa: 'carregando', fracao: m.progress });
      },
    });
    // Cupom é um bloco de linhas: ler linha por linha, mantendo o valor junto do rótulo ("Valor a pagar R$ 49,90")
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
    return w;
  })().catch((e) => { leitor = null; throw e; });
  return leitor;
}

/** Fecha o leitor depois de um tempo sem uso (libera memória do celular). */
function agendarDesligamento() {
  clearTimeout(desligar);
  desligar = setTimeout(() => { void leitor?.then((l) => l.terminate()); leitor = null; }, 90_000);
}

/**
 * Prepara a foto: corrige a rotação da câmera, ajusta o tamanho (reduz foto grande, amplia imagem
 * pequena) e aumenta o contraste em tons de cinza.
 */
export async function prepararImagem(origem: Blob | HTMLCanvasElement, maximo = 2000): Promise<HTMLCanvasElement> {
  const bitmap = origem instanceof Blob ? await createImageBitmap(origem, { imageOrientation: 'from-image' }) : origem;
  // Foto grande: reduz (mais rápido). Imagem pequena (print, foto de longe): amplia até 3x,
  // porque o leitor precisa de letras com uns 20–30 pixels de altura.
  const maior = Math.max(bitmap.width, bitmap.height);
  const escala = maior > maximo ? maximo / maior : bitmap.width < 1200 ? Math.min(3, 1200 / bitmap.width) : 1;
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(bitmap.width * escala));
  tela.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, tela.width, tela.height);
  if ('close' in bitmap) bitmap.close();
  const img = ctx.getImageData(0, 0, tela.width, tela.height);
  const d = img.data;
  // Tons de cinza + "esticar" o contraste (2% mais escuros viram preto, 2% mais claros viram branco)
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = y; hist[y]++; }
  const total = d.length / 4;
  let baixo = 0, alto = 255, soma = 0;
  for (; baixo < 255 && (soma += hist[baixo]) < total * 0.02; baixo++);
  soma = 0;
  for (; alto > 0 && (soma += hist[alto]) < total * 0.02; alto--);
  // Limites: nunca "esticar" demais (em foto de fundo branco, o ruído do JPEG viraria preto)
  baixo = Math.min(baixo, 110);
  alto = Math.max(alto, 170);
  const faixa = alto - baixo;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - baixo) * 255) / faixa));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return tela;
}

/** Lê o texto de uma foto (ou página já desenhada). Pode demorar alguns segundos no celular. */
export async function lerTexto(origem: Blob | HTMLCanvasElement, aoProgredir?: (p: Progresso) => void): Promise<string> {
  avisar = aoProgredir ?? null;
  try {
    aoProgredir?.({ etapa: 'preparando', fracao: 0 });
    const imagem = await prepararImagem(origem);
    aoProgredir?.({ etapa: 'carregando', fracao: 0 });
    const l = await obterLeitor();
    const { data } = await l.recognize(imagem);
    return data.text;
  } finally {
    avisar = null;
    agendarDesligamento();
  }
}

/** Cancela uma leitura em andamento (fecha o leitor; o próximo uso abre outro). */
export async function cancelarLeitura(): Promise<void> {
  const atual = leitor;
  leitor = null;
  if (atual) await atual.then((l) => l.terminate()).catch(() => {});
}
