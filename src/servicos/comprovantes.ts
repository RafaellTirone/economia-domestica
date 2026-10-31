import { banco } from '../db/banco';
import type { ArquivoGuardado } from '../tipos';

// Comprovantes dos cofrinhos (print do Pix, foto do recibo, PDF). Ficam só no aparelho.
// Fotos são reduzidas (lado maior de até 1600 px, JPEG) para não ocupar muito espaço.

export const TAMANHO_MAXIMO = 15 * 1024 * 1024;
const TIPOS_ACEITOS = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;

/** Confere tipo e tamanho. Devolve a mensagem de erro, ou null se estiver tudo certo. */
export function validarComprovante(arquivo: { name: string; type: string; size: number }): string | null {
  const tipo = arquivo.type || (/\.pdf$/i.test(arquivo.name) ? 'application/pdf' : /\.(jpe?g|png|webp|heic)$/i.test(arquivo.name) ? 'image/jpeg' : '');
  if (!TIPOS_ACEITOS.test(tipo)) return `“${arquivo.name}” não é foto nem PDF.`;
  if (arquivo.size > TAMANHO_MAXIMO) return `“${arquivo.name}” passa de 15 MB.`;
  if (arquivo.size === 0) return `“${arquivo.name}” está vazio.`;
  return null;
}

/** Calcula o novo tamanho mantendo a proporção (lado maior até "maximo"). */
export function novoTamanho(largura: number, altura: number, maximo = 1600): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= maximo) return { largura, altura };
  const f = maximo / maior;
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) };
}

/** Reduz a foto. Se o navegador não conseguir abrir o formato (ex.: HEIC), guarda o original. */
async function prepararImagem(arquivo: File): Promise<{ dados: Blob; tipo: string; nome: string }> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const { largura, altura } = novoTamanho(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    // Print de tela (PNG) continua PNG para o texto não borrar; foto vira JPEG (ocupa menos)
    const png = /png/i.test(arquivo.type);
    const tipo = png ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.82));
    const reduziu = largura < bitmap.width || altura < bitmap.height;
    bitmap.close();
    if (!blob || (!reduziu && blob.size >= arquivo.size)) return { dados: arquivo, tipo: arquivo.type || 'image/jpeg', nome: arquivo.name };
    return { dados: blob, tipo, nome: png ? arquivo.name : arquivo.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { dados: arquivo, tipo: arquivo.type || 'image/jpeg', nome: arquivo.name };
  }
}

/** Guarda os comprovantes e liga ao depósito/saque. Devolve os erros dos arquivos recusados. */
export async function anexarComprovantes(movimentoId: number, arquivos: File[]): Promise<string[]> {
  const erros: string[] = [];
  const ids: number[] = [];
  for (const a of arquivos) {
    const erro = validarComprovante(a);
    if (erro) { erros.push(erro); continue; }
    const pronto = /pdf/i.test(a.type) || /\.pdf$/i.test(a.name) ? { dados: a as Blob, tipo: 'application/pdf', nome: a.name } : await prepararImagem(a);
    ids.push(await banco.arquivos.add({ nome: pronto.nome, tipo: pronto.tipo, tamanho: pronto.dados.size, dados: pronto.dados, criadoEm: new Date().toISOString() }));
  }
  if (ids.length) {
    const m = await banco.movimentosCofrinho.get(movimentoId);
    await banco.movimentosCofrinho.update(movimentoId, { comprovantes: [...(m?.comprovantes ?? []), ...ids] });
  }
  return erros;
}

export async function removerComprovante(movimentoId: number, arquivoId: number): Promise<ArquivoGuardado | undefined> {
  return banco.transaction('rw', banco.movimentosCofrinho, banco.arquivos, async () => {
    const copia = await banco.arquivos.get(arquivoId);
    const m = await banco.movimentosCofrinho.get(movimentoId);
    await banco.movimentosCofrinho.update(movimentoId, { comprovantes: (m?.comprovantes ?? []).filter((i) => i !== arquivoId) });
    await banco.arquivos.delete(arquivoId);
    return copia;
  });
}

/** Desfaz a remoção (guarda de novo com o mesmo id). */
export async function restaurarComprovante(movimentoId: number, arquivo: ArquivoGuardado): Promise<void> {
  await banco.transaction('rw', banco.movimentosCofrinho, banco.arquivos, async () => {
    await banco.arquivos.put(arquivo);
    const m = await banco.movimentosCofrinho.get(movimentoId);
    await banco.movimentosCofrinho.update(movimentoId, { comprovantes: [...(m?.comprovantes ?? []), arquivo.id!] });
  });
}

/** "1,2 MB" / "350 KB" */
export function formatarTamanho(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
