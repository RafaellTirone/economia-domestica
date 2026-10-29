// Tipos de dados do aplicativo.
// Regra de ouro: dinheiro SEMPRE em centavos inteiros (R$ 12,34 = 1234) e datas SEMPRE
// como texto 'AAAA-MM-DD', sem fuso horário — assim 01/10 nunca vira 30/09.

/** Valor em centavos (número inteiro). */
export type Centavos = number;

/** Data no formato 'AAAA-MM-DD'. */
export type DataISO = string;

/** Nomes de ícones disponíveis para categorias (ver componentes/ui/IconeCategoria.tsx). */
export type NomeIcone =
  | 'casa' | 'carrinho' | 'carro' | 'raio' | 'banco' | 'saude' | 'livro' | 'limpeza'
  | 'lazer' | 'camiseta' | 'caixa' | 'maleta' | 'brilho' | 'moedas' | 'pet' | 'presente';

export interface Subcategoria {
  id: string;
  nome: string;
}

export interface Categoria {
  id?: number;
  nome: string;
  /** Cor em hexadecimal, ex.: '#2a78d6'. */
  cor: string;
  icone: NomeIcone;
  /** Categorias de despesa ou de receita. */
  tipo: 'despesa' | 'receita';
  subcategorias: Subcategoria[];
  /** Limite de gasto por mês (orçamento). Nulo = sem limite. */
  limiteMensal: Centavos | null;
  /** Veio pronta com o app (pode ser editada, mas não some sem confirmação). */
  padrao: boolean;
  /** Posição na lista. */
  ordem: number;
}

/** 'guardado' = dinheiro enviado para um cofrinho. NÃO é despesa. */
export type TipoLancamento = 'despesa' | 'receita' | 'guardado';

export type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito';

export interface Lancamento {
  id?: number;
  tipo: TipoLancamento;
  data: DataISO;
  descricao: string;
  valor: Centavos;
  categoriaId: number;
  subcategoriaId?: string;
  forma: FormaPagamento;
  observacao?: string;
  /** Despesa fixa (aluguel, luz…) — repete todo mês. */
  fixa: boolean;
  situacao: 'pago' | 'a_pagar';
  /** Liga as ocorrências de uma mesma conta fixa. */
  recorrenciaId?: string;
  /** Compra parcelada no cartão: cada parcela cai no mês dela. */
  parcela?: { numero: number; total: number; grupoId: string };
  /** Marcado nos dados de exemplo, para poder apagar só eles. */
  exemplo?: boolean;
  criadoEm: string;
}

export interface Configuracao {
  chave: string;
  valor: unknown;
}
