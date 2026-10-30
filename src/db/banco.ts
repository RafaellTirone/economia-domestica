import Dexie, { type Table } from 'dexie';
import type { ArquivoGuardado, Categoria, Cofrinho, Configuracao, Desejo, Emprestimo, Lancamento, MovimentoCofrinho, PagamentoParcela } from '../tipos';
import { categoriasPadrao } from './categoriasPadrao';

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

    // Roda uma única vez, quando o banco é criado: grava as categorias padrão.
    this.on('populate', (tx) => {
      tx.table('categorias').bulkAdd(categoriasPadrao());
    });
  }
}

/** Banco usado pelo app. */
export const banco = new BancoFinancas();
