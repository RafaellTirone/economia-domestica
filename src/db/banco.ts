import Dexie, { type Table } from 'dexie';
import type { Categoria, Configuracao, Lancamento } from '../tipos';
import { categoriasPadrao } from './categoriasPadrao';

// Banco de dados local (IndexedDB) — os dados ficam SÓ no aparelho, nada vai para a internet.
// Cada mudança de estrutura ganha uma nova "versão" aqui, para os dados antigos serem migrados.

export class BancoFinancas extends Dexie {
  categorias!: Table<Categoria, number>;
  lancamentos!: Table<Lancamento, number>;
  configuracoes!: Table<Configuracao, string>;

  constructor(nome = 'economia-domestica') {
    super(nome);

    // Versão 1: categorias, lançamentos e configurações.
    // Os campos listados são os "índices" (usados para buscar e filtrar rápido).
    this.version(1).stores({
      categorias: '++id, nome, tipo, ordem',
      lancamentos: '++id, data, tipo, categoriaId, situacao, recorrenciaId, [tipo+data]',
      configuracoes: 'chave',
    });

    // Roda uma única vez, quando o banco é criado: grava as categorias padrão.
    this.on('populate', (tx) => {
      tx.table('categorias').bulkAdd(categoriasPadrao());
    });
  }
}

/** Banco usado pelo app. */
export const banco = new BancoFinancas();
