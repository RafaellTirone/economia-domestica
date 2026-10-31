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
  /** Conta fixa (aluguel, luz, salário…) — repete todo mês. */
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

/** Conta ou receita que se repete todo mês (aluguel, luz, salário…). Cada mês vira um lançamento. */
export interface Recorrencia {
  id?: number;
  tipo: 'despesa' | 'receita';
  descricao: string;
  valor: Centavos;
  categoriaId: number;
  subcategoriaId?: string;
  forma: FormaPagamento;
  /** Dia do mês (1 a 31). Em meses mais curtos, cai no último dia. */
  dia: number;
  /** Primeiro mês a gerar automaticamente ('AAAA-MM'). */
  inicio: string;
  /** Último mês ('AAAA-MM'); null = sem fim. */
  fim: string | null;
  /** Meses em que a pessoa excluiu a conta "só deste mês" — não são gerados de novo. */
  pulados: string[];
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
  /**
   * Consignado: como o salário é lançado no app. 'bruto' (valor do holerite) → o app lança a parcela
   * como despesa no dia do salário; 'liquido' (o que cai na conta) → nada a lançar, já veio descontado.
   */
  salarioLancado?: 'bruto' | 'liquido';
  /** A partir de quando o app lança as parcelas descontadas como despesa. */
  lancarDescontoDesde?: DataISO | null;
  /** A conferência foi feita automaticamente pela análise do app (tudo bateu). */
  conferenciaAutomatica?: boolean;
  contratoArquivoId: number | null;
  observacao?: string;
  criadoEm: string;
  /** Dados de exemplo (podem ser apagados de uma vez). */
  exemplo?: boolean;
}

export interface PagamentoParcela {
  id?: number;
  emprestimoId: number;
  numeroParcela: number;
  dataPagamento: DataISO;
  valorPago: Centavos;
  /** Lançamento de despesa criado junto (categoria Dívidas). */
  lancamentoId: number | null;
  /** Dados de exemplo (podem ser apagados de uma vez). */
  exemplo?: boolean;
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

// ---------- Cofrinhos e desejos ----------

export type OndeGuarda = 'tesouro-selic' | 'cdb' | 'caixinha' | 'poupanca' | 'conta' | 'outro';

/** Meta de economia ligada a um lugar real onde o dinheiro está (sempre no nome da pessoa). */
export interface Cofrinho {
  id?: number;
  nome: string;
  meta: Centavos;
  /** Data limite para chegar na meta (opcional). */
  prazo: DataISO | null;
  ondeGuarda: OndeGuarda;
  /** Rendimento estimado em % ao mês (editável). Null = sem rendimento. */
  rendimentoMensal: number | null;
  /** Quanto pretende guardar por mês (opcional, para a previsão). */
  depositoMensal: Centavos | null;
  criadoEm: string;
  /** Dados de exemplo (podem ser apagados de uma vez). */
  exemplo?: boolean;
}

export interface MovimentoCofrinho {
  id?: number;
  cofrinhoId: number;
  tipo: 'deposito' | 'saque';
  valor: Centavos;
  data: DataISO;
  via: 'pix' | 'manual';
  /** Lançamento "Guardei" criado junto (não conta como despesa). */
  lancamentoId: number | null;
  /** Comprovantes (print do Pix, foto do recibo, PDF) guardados no aparelho — ids em "arquivos". */
  comprovantes?: number[];
  /** Dados de exemplo (podem ser apagados de uma vez). */
  exemplo?: boolean;
}

/** Intenção de compra. */
export interface Desejo {
  id?: number;
  nome: string;
  precoVista: Centavos;
  /** Se parcelar: número de parcelas e valor de cada uma. */
  parcelas: number | null;
  valorParcela: Centavos | null;
  prioridade: 'alta' | 'media' | 'baixa';
  /** Quanto pretende guardar por mês para comprar. */
  guardarPorMes: Centavos | null;
  /** Até quando quer comprar (opcional). */
  quando: DataISO | null;
  cofrinhoId: number | null;
  comprado: boolean;
  criadoEm: string;
  /** Dados de exemplo (podem ser apagados de uma vez). */
  exemplo?: boolean;
}
