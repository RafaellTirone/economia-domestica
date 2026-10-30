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

// ---------- Empréstimos e contratos ----------

export type PeriodoTaxa = 'dia' | 'mes' | 'ano';

export type TipoEmprestimo = 'consignado' | 'pessoal' | 'veiculo' | 'imovel' | 'cartao' | 'parentes' | 'outro';

/** Um contrato de empréstimo/financiamento. Taxas em % (ex.: 1.89 = 1,89%). */
export interface Emprestimo {
  id?: number;
  /** Nome que a pessoa escolhe ("Consignado do carro"). */
  nome: string;
  instituicao: string;
  numeroContrato: string;
  tipo: TipoEmprestimo;
  valorEmprestado: Centavos;
  numeroParcelas: number;
  /** Valor da parcela como está no contrato (pode incluir seguros e tarifas). */
  valorParcela: Centavos;
  /** Taxa de juros do contrato (null = não informada; o app calcula pelas parcelas). */
  taxaJuros: number | null;
  periodoTaxa: PeriodoTaxa;
  /** Custo Efetivo Total ao ano, se o contrato informar. */
  cetAnual: number | null;
  sistema: 'price' | 'sac';
  dataContratacao: DataISO | null;
  dataPrimeiraParcela: DataISO;
  /** Multa por atraso, cobrada uma vez (% da parcela). */
  multaAtraso: number;
  /** Juros de mora (% no período indicado), cobrados por dia de atraso. */
  jurosMora: number;
  periodoMora: PeriodoTaxa;
  /** Onde cada termo foi encontrado no contrato (trecho do texto), para conferência. */
  trechos: Partial<Record<string, string>>;
  /** Os termos foram conferidos com o contrato. */
  termosConferidos: boolean;
  /** Consignado: parcelas descontadas direto do salário (conta como paga no dia do salário). */
  descontoEmFolha?: boolean;
  /** A conferência foi feita automaticamente pela análise do app (tudo bateu). */
  conferenciaAutomatica?: boolean;
  contratoArquivoId: number | null;
  observacao?: string;
  criadoEm: string;
}

export interface PagamentoParcela {
  id?: number;
  emprestimoId: number;
  numeroParcela: number;
  dataPagamento: DataISO;
  valorPago: Centavos;
  /** Lançamento de despesa criado junto (categoria Dívidas). */
  lancamentoId: number | null;
}

/** Arquivo guardado no aparelho (ex.: PDF do contrato). */
export interface ArquivoGuardado {
  id?: number;
  nome: string;
  tipo: string;
  tamanho: number;
  dados: Blob;
  criadoEm: string;
}
