import { banco } from '../db/banco';
import type { Categoria, NomeIcone } from '../tipos';
import { idDeSubcategoria } from '../db/categoriasPadrao';

// Criar, editar e excluir categorias (com cor, ícone, subcategorias e limite do mês).

export const CORES_CATEGORIA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#0f8b8d', '#a0522d', '#8a8984', '#4B3FC4'];

export interface DadosCategoria {
  nome: string;
  tipo: 'despesa' | 'receita';
  cor: string;
  icone: NomeIcone;
  subcategorias: string[];
  limiteMensal: number | null;
}

export function validarCategoria(d: DadosCategoria, existentes: Categoria[], idAtual?: number): Record<string, string> {
  const e: Record<string, string> = {};
  const nome = d.nome.trim();
  if (!nome) e.nome = 'Dê um nome à categoria.';
  else if (nome.length > 40) e.nome = 'Use no máximo 40 letras.';
  else if (existentes.some((c) => c.id !== idAtual && c.tipo === d.tipo && c.nome.trim().toLowerCase() === nome.toLowerCase())) e.nome = 'Já existe uma categoria com esse nome.';
  const subs = d.subcategorias.map((s) => s.trim()).filter(Boolean);
  if (new Set(subs.map((s) => s.toLowerCase())).size !== subs.length) e.subcategorias = 'Há subcategorias repetidas.';
  if (subs.some((s) => s.length > 40)) e.subcategorias = 'Subcategorias com no máximo 40 letras.';
  if (d.limiteMensal !== null && (!Number.isSafeInteger(d.limiteMensal) || d.limiteMensal < 0)) e.limiteMensal = 'Limite inválido.';
  return e;
}

/** Mantém os ids das subcategorias que já existiam (os lançamentos apontam para eles). */
function montarSubcategorias(nomes: string[], anteriores: Categoria['subcategorias'] = []) {
  const usados = new Set<string>();
  return nomes.map((n) => n.trim()).filter(Boolean).map((nome) => {
    const igual = anteriores.find((s) => s.nome === nome && !usados.has(s.id));
    let id = igual?.id ?? idDeSubcategoria(nome);
    while (usados.has(id)) id += '-2';
    usados.add(id);
    return { id, nome };
  });
}

export async function salvarCategoria(d: DadosCategoria, id?: number): Promise<number> {
  if (id) {
    const atual = await banco.categorias.get(id);
    await banco.categorias.update(id, {
      nome: d.nome.trim(), cor: d.cor, icone: d.icone, limiteMensal: d.tipo === 'despesa' ? d.limiteMensal : null,
      subcategorias: montarSubcategorias(d.subcategorias, atual?.subcategorias),
    });
    return id;
  }
  const ordem = ((await banco.categorias.orderBy('ordem').last())?.ordem ?? 0) + 1;
  return banco.categorias.add({
    nome: d.nome.trim(), tipo: d.tipo, cor: d.cor, icone: d.icone, subcategorias: montarSubcategorias(d.subcategorias),
    limiteMensal: d.tipo === 'despesa' ? d.limiteMensal : null, padrao: false, ordem,
  });
}

export async function lancamentosDaCategoria(id: number): Promise<number> {
  return banco.lancamentos.where('categoriaId').equals(id).count();
}

/** Exclui a categoria. Se tiver lançamentos, eles vão para "moverPara" (obrigatório nesse caso). */
export async function excluirCategoria(id: number, moverPara: number | null): Promise<void> {
  await banco.transaction('rw', banco.categorias, banco.lancamentos, async () => {
    const cat = await banco.categorias.get(id);
    if (!cat) return;
    const daMesma = await banco.categorias.where('tipo').equals(cat.tipo).count();
    if (daMesma <= 1) throw new Error('Precisa existir pelo menos uma categoria de cada tipo.');
    const quantos = await banco.lancamentos.where('categoriaId').equals(id).count();
    if (quantos > 0) {
      if (!moverPara || moverPara === id) throw new Error('Escolha para qual categoria mover os lançamentos.');
      await banco.lancamentos.where('categoriaId').equals(id).modify({ categoriaId: moverPara, subcategoriaId: undefined });
    }
    await banco.categorias.delete(id);
  });
}
