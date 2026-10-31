import { banco } from '../db/banco';
import type { Categoria, Centavos, DataISO, FormaPagamento, Lancamento, TipoLancamento } from '../tipos';
import { adicionarMeses, hojeISO, partesDaData } from '../utils/datas';

// Regras dos lançamentos: validar, criar (inclusive parcelado no cartão), editar, excluir e desfazer.

/** Dados que a tela de lançamento envia. */
export interface DadosLancamento {
  tipo: TipoLancamento;
  data: DataISO;
  descricao: string;
  valor: Centavos;
  categoriaId: number | null;
  subcategoriaId?: string;
  forma: FormaPagamento;
  observacao?: string;
  fixa: boolean;
  situacao: 'pago' | 'a_pagar';
  /** Número de parcelas no cartão de crédito (1 = à vista). */
  parcelas: number;
}

export const LIMITES = { valorMaximo: 1_000_000_000, descricao: 80, observacao: 500, parcelas: 48 } as const;

/** Confere os dados e devolve as mensagens de erro por campo (vazio = tudo certo). */
export function validarLancamento(d: DadosLancamento): Partial<Record<keyof DadosLancamento, string>> {
  const erros: Partial<Record<keyof DadosLancamento, string>> = {};
  if (!Number.isSafeInteger(d.valor) || d.valor <= 0) erros.valor = 'Digite um valor maior que zero.';
  else if (d.valor > LIMITES.valorMaximo) erros.valor = 'Valor muito alto. Confira se digitou certo.';
  if (!d.categoriaId) erros.categoriaId = 'Escolha uma categoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(Date.parse(d.data))) erros.data = 'Data inválida.';
  if (d.descricao.trim().length > LIMITES.descricao) erros.descricao = `Use no máximo ${LIMITES.descricao} letras.`;
  if ((d.observacao ?? '').length > LIMITES.observacao) erros.observacao = `Use no máximo ${LIMITES.observacao} letras.`;
  if (!Number.isInteger(d.parcelas) || d.parcelas < 1 || d.parcelas > LIMITES.parcelas) erros.parcelas = 'Número de parcelas inválido.';
  if (d.parcelas > 1 && (d.tipo !== 'despesa' || d.forma !== 'credito')) erros.parcelas = 'Parcelamento só para despesa no crédito.';
  return erros;
}

/**
 * Divide um valor em parcelas iguais, sem perder centavos: a diferença vai para a 1ª parcela.
 * Ex.: R$ 100,00 em 3x → 33,34 + 33,33 + 33,33.
 */
export function dividirEmParcelas(total: Centavos, parcelas: number): Centavos[] {
  const base = Math.floor(total / parcelas);
  const resto = total - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => base + (i === 0 ? resto : 0));
}

/** Gera um identificador único (para ligar parcelas de uma mesma compra). */
export function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Monta os lançamentos que serão gravados. Compra parcelada no cartão vira uma parcela
 * por mês, cada uma no mês dela (regra combinada), mantendo o dia da compra.
 */
export function montarLancamentos(d: DadosLancamento, agora = new Date()): Lancamento[] {
  const criadoEm = agora.toISOString();
  const descricao = d.descricao.trim();
  const base = {
    tipo: d.tipo, descricao, categoriaId: d.categoriaId!, subcategoriaId: d.subcategoriaId || undefined,
    forma: d.forma, observacao: d.observacao?.trim() || undefined, fixa: d.tipo !== 'guardado' && d.fixa && d.parcelas <= 1, criadoEm,
  };
  if (d.parcelas <= 1) return [{ ...base, data: d.data, valor: d.valor, situacao: d.situacao }];

  const grupoId = novoId();
  const diaDaCompra = partesDaData(d.data).dia;
  const hoje = hojeISO(agora);
  return dividirEmParcelas(d.valor, d.parcelas).map((valor, i) => {
    const data = adicionarMeses(d.data, i, diaDaCompra);
    return {
      ...base, data, valor,
      // 1ª parcela segue o que a pessoa marcou; as futuras ficam "a pagar"
      situacao: i === 0 ? d.situacao : data <= hoje ? 'pago' : 'a_pagar',
      parcela: { numero: i + 1, total: d.parcelas, grupoId },
    };
  });
}

/** Grava um lançamento novo (ou todas as parcelas). Devolve os ids criados. */
export async function criarLancamento(d: DadosLancamento): Promise<number[]> {
  const lista = montarLancamentos(d);
  return banco.transaction('rw', banco.lancamentos, async () => (await banco.lancamentos.bulkAdd(lista, { allKeys: true })) as number[]);
}

/** Altera um lançamento existente (só ele — parcelas irmãs não mudam). */
export async function atualizarLancamento(id: number, d: DadosLancamento): Promise<void> {
  const atual = await banco.lancamentos.get(id);
  if (!atual) throw new Error('Lançamento não encontrado.');
  const [novo] = montarLancamentos({ ...d, parcelas: 1 });
  await banco.lancamentos.put({
    ...novo, id, parcela: atual.parcela, criadoEm: atual.criadoEm, exemplo: atual.exemplo,
    // Conta que se repete continua ligada à repetição
    recorrenciaId: atual.recorrenciaId, fixa: atual.recorrenciaId ? true : novo.fixa,
  });
}

/** Exclui e devolve uma cópia, para o botão "Desfazer". */
export async function excluirLancamento(id: number): Promise<Lancamento | undefined> {
  const copia = await banco.lancamentos.get(id);
  if (copia) await banco.lancamentos.delete(id);
  return copia;
}

/** Desfaz uma exclusão (grava de volta com o mesmo id). */
export async function restaurarLancamento(l: Lancamento): Promise<void> {
  await banco.lancamentos.put(l);
}

// ---------- Busca e filtros ----------

export interface Filtros {
  inicio: DataISO;
  fim: DataISO;
  tipo: 'todos' | TipoLancamento;
  categoriaId: number | null;
  busca: string;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Aplica os filtros e ordena do mais recente para o mais antigo. Busca ignora acentos e maiúsculas. */
export function filtrarLancamentos(lista: Lancamento[], f: Filtros, categorias: Categoria[] = []): Lancamento[] {
  const termo = semAcento(f.busca.trim());
  const nomes = new Map(categorias.map((c) => [c.id, c]));
  return lista
    .filter((l) => l.data >= f.inicio && l.data <= f.fim)
    .filter((l) => f.tipo === 'todos' || l.tipo === f.tipo)
    .filter((l) => !f.categoriaId || l.categoriaId === f.categoriaId)
    .filter((l) => {
      if (!termo) return true;
      const cat = nomes.get(l.categoriaId);
      const sub = cat?.subcategorias.find((s) => s.id === l.subcategoriaId)?.nome ?? '';
      return semAcento(`${l.descricao} ${l.observacao ?? ''} ${cat?.nome ?? ''} ${sub}`).includes(termo);
    })
    .sort((a, b) => b.data.localeCompare(a.data) || (b.id ?? 0) - (a.id ?? 0));
}

/** Totais de uma lista (para o topo da tela de lançamentos). */
export function totais(lista: Lancamento[]): { receitas: Centavos; despesas: Centavos; guardado: Centavos } {
  return lista.reduce((t, l) => {
    if (l.tipo === 'receita') t.receitas += l.valor;
    else if (l.tipo === 'despesa') t.despesas += l.valor;
    else t.guardado += l.valor;
    return t;
  }, { receitas: 0, despesas: 0, guardado: 0 });
}

/**
 * Sugestão inteligente: se a pessoa já lançou "Padaria" antes, sugere a mesma categoria,
 * subcategoria e forma de pagamento. Usa o lançamento mais recente com a mesma descrição.
 */
export function sugestaoPorDescricao(descricao: string, historico: Lancamento[]): Pick<Lancamento, 'categoriaId' | 'subcategoriaId' | 'forma' | 'tipo'> | null {
  const alvo = semAcento(descricao.trim());
  if (alvo.length < 2) return null;
  let melhor: Lancamento | null = null;
  for (const l of historico) {
    if (semAcento(l.descricao) === alvo && (!melhor || l.data > melhor.data)) melhor = l;
  }
  return melhor ? { categoriaId: melhor.categoriaId, subcategoriaId: melhor.subcategoriaId, forma: melhor.forma, tipo: melhor.tipo } : null;
}

/** Descrições mais usadas (para o "repetir um recente" e a lista de sugestões). */
export function descricoesFrequentes(historico: Lancamento[], limite = 8): string[] {
  const contagem = new Map<string, { texto: string; vezes: number; ultima: string }>();
  for (const l of historico) {
    if (!l.descricao) continue;
    const chave = semAcento(l.descricao);
    const atual = contagem.get(chave);
    if (atual) { atual.vezes++; if (l.data > atual.ultima) atual.ultima = l.data; }
    else contagem.set(chave, { texto: l.descricao, vezes: 1, ultima: l.data });
  }
  return [...contagem.values()].sort((a, b) => b.vezes - a.vezes || b.ultima.localeCompare(a.ultima)).slice(0, limite).map((c) => c.texto);
}
