import Dexie, { type Table } from 'dexie';
import type { ArquivoGuardado, Categoria, Cofrinho, Configuracao, Desejo, Emprestimo, Lancamento, MovimentoCofrinho, PagamentoParcela, Recorrencia } from '../tipos';
import { categoriasPadrao } from './categoriasPadrao';

/**
 * Lançamentos "fixa" sem repetição ligada (de versões antigas ou de backup antigo) viram uma
 * repetição por descrição + categoria, que gera só do mês atual em diante (nada é duplicado no passado).
 */
export async function converterFixasAntigas(lancamentos: Table<Lancamento, number>, recorrencias: Table<Recorrencia, number>): Promise<void> {
  const fixas = (await lancamentos.toArray()).filter((l) => l.fixa && !l.recorrenciaId && l.tipo !== 'guardado' && !l.parcela);
  const grupos = new Map<string, Lancamento[]>();
  for (const l of fixas) {
    const chave = `${l.tipo}|${l.categoriaId}|${l.descricao.trim().toLowerCase()}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), l]);
  }
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.data.localeCompare(b.data));
    const ultimo = lista[lista.length - 1];
    const proximo = (() => { const [a, m] = ultimo.data.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; })();
    const id = String(await recorrencias.add({
      tipo: ultimo.tipo as Recorrencia['tipo'], descricao: ultimo.descricao.trim(), valor: ultimo.valor, categoriaId: ultimo.categoriaId,
      subcategoriaId: ultimo.subcategoriaId, forma: ultimo.forma, dia: Number(ultimo.data.slice(8, 10)),
      inicio: proximo > mesAtual ? proximo : mesAtual, fim: null, pulados: [], exemplo: ultimo.exemplo, criadoEm: agora.toISOString(),
    }));
    for (const l of lista) await lancamentos.update(l.id!, { recorrenciaId: id });
  }
}

// Banco de dados local (IndexedDB) — os dados ficam SÓ no aparelho, nada vai para a internet.
// Cada mudança de estrutura ganha uma nova "versão" aqui, para os dados antigos serem migrados.

export class BancoFinancas extends Dexie {
  categorias!: Table<Categoria, number>;
  lancamentos!: Table<Lancamento, number>;
  configuracoes!: Table<Configuracao, string>;
  emprestimos!: Table<Emprestimo, number>;
  pagamentosParcela!: Table<PagamentoParcela, number>;
  arquivos!: Table<ArquivoGuardado, number>;
  cofrinhos!: Table<Cofrinho, number>;
  movimentosCofrinho!: Table<MovimentoCofrinho, number>;
  desejos!: Table<Desejo, number>;
  recorrencias!: Table<Recorrencia, number>;

  constructor(nome = 'economia-domestica') {
    super(nome);

    // Versão 1: categorias, lançamentos e configurações.
    // Os campos listados são os "índices" (usados para buscar e filtrar rápido).
    this.version(1).stores({
      categorias: '++id, nome, tipo, ordem',
      lancamentos: '++id, data, tipo, categoriaId, situacao, recorrenciaId, [tipo+data]',
      configuracoes: 'chave',
    });

    // Versão 2: empréstimos, pagamentos de parcelas e arquivos (PDF do contrato).
    // Os dados da versão 1 continuam intactos.
    this.version(2).stores({
      emprestimos: '++id, nome',
      pagamentosParcela: '++id, emprestimoId, [emprestimoId+numeroParcela]',
      arquivos: '++id',
    });

    // Versão 3: cofrinhos (metas de economia), seus depósitos/saques e desejos (intenções de compra).
    this.version(3).stores({
      cofrinhos: '++id, nome',
      movimentosCofrinho: '++id, cofrinhoId, data',
      desejos: '++id, nome',
    });

    // Versão 4: contas que se repetem todo mês. Os lançamentos marcados como "fixa" de antes
    // viram uma repetição (uma por descrição + categoria), que passa a gerar só do mês atual em diante.
    this.version(4).stores({ recorrencias: '++id' }).upgrade((tx) => converterFixasAntigas(tx.table('lancamentos'), tx.table('recorrencias')));

    // Roda uma única vez, quando o banco é criado: grava as categorias padrão.
    this.on('populate', (tx) => {
      tx.table('categorias').bulkAdd(categoriasPadrao());
    });
  }
}

/** Banco usado pelo app. */
export const banco = new BancoFinancas();
