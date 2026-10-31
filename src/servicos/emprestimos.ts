import { banco } from '../db/banco';
import type { Centavos, DataISO, Emprestimo, PagamentoParcela } from '../tipos';
import { adicionarMeses, diaDoSalario, diferencaEmDias, formatarData, formatarDiaMes, hojeISO, partesDaData, proximoDiaUtil, type RegraSalario } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';
import { converterTaxa, encargosDeAtraso, saldoDevedor, tabelaDeParcelas, taxaImplicita, type Encargos } from './juros';

// Regras dos empréstimos: situação de cada parcela, atrasos com os encargos do contrato,
// juros que a pessoa está pagando, mensagens de incentivo/alerta e registro de pagamentos.

export interface SituacaoParcela {
  numero: number;
  /** Vencimento do contrato. */
  vencimento: DataISO;
  /** Se cair em fim de semana/feriado, pode pagar no próximo dia útil sem multa. */
  vencimentoUtil: DataISO;
  valor: Centavos;
  juros: Centavos | null;
  amortizacao: Centavos | null;
  pagamento?: PagamentoParcela;
  /** Consignado: descontada automaticamente do salário. */
  descontadaDoSalario?: boolean;
  status: 'paga' | 'atrasada' | 'vence-hoje' | 'a-vencer';
  /** Só para parcelas atrasadas. */
  encargos?: Encargos;
}

export interface Mensagem { tipo: 'quitado' | 'atraso' | 'lembrete' | 'parabens' | 'info'; texto: string }

export interface ResumoEmprestimo {
  emprestimo: Emprestimo;
  /** Taxa mensal usada nos cálculos (do contrato ou calculada pelas parcelas). */
  taxaMensal: number | null;
  fonteTaxa: 'contrato' | 'calculada' | null;
  /** Taxa que as parcelas realmente embutem. */
  taxaImplicitaMensal: number | null;
  /** A taxa informada não bate com as parcelas (pode haver seguro/tarifas embutidos). */
  taxaDiverge: boolean;
  parcelas: SituacaoParcela[];
  pagas: number;
  faltam: number;
  percentualQuitado: number;
  proxima: SituacaoParcela | null;
  atrasadas: SituacaoParcela[];
  saldoDevedor: Centavos;
  economiaQuitandoHoje: Centavos;
  parcelaSemJuros: Centavos;
  jurosPorParcelaMedio: Centavos;
  jurosTotalContrato: Centavos;
  sequenciaEmDia: number;
  status: 'em-dia' | 'atrasado' | 'quitado';
  mensagem: Mensagem;
}

/**
 * Para consignado com desconto em folha: a parcela é descontada no dia do salário do mês do vencimento.
 * Devolve null se não for desconto em folha ou se o dia do salário não foi cadastrado.
 */
export function dataDoDesconto(e: Pick<Emprestimo, 'descontoEmFolha'>, vencimento: DataISO, regra: RegraSalario | null | undefined): DataISO | null {
  if (!e.descontoEmFolha || !regra) return null;
  const { ano, mes } = partesDaData(vencimento);
  return diaDoSalario(ano, mes, regra);
}

/**
 * Quantas parcelas já foram pagas até hoje (estimativa para o cadastro):
 * - consignado com desconto em folha: quantos salários já caíram desde o 1º desconto;
 * - outros: quantas parcelas já venceram (supondo que foram pagas em dia).
 */
export function estimarParcelasPagas(
  d: { dataPrimeiraParcela: DataISO; numeroParcelas: number; descontoEmFolha?: boolean },
  regra: RegraSalario | null | undefined,
  hoje: DataISO = hojeISO(),
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dataPrimeiraParcela) || !(d.numeroParcelas > 0)) return 0;
  const dia = partesDaData(d.dataPrimeiraParcela).dia;
  let pagas = 0;
  for (let k = 0; k < d.numeroParcelas; k++) {
    const venc = adicionarMeses(d.dataPrimeiraParcela, k, dia);
    const quando = dataDoDesconto(d, venc, regra) ?? proximoDiaUtil(venc);
    if (d.descontoEmFolha && regra ? quando <= hoje : quando < hoje) pagas++;
    else break;
  }
  return pagas;
}

/**
 * Quando o contrato só tem a data da contratação: estima a 1ª parcela.
 * Consignado → salário do mês seguinte; outros → um mês depois da contratação.
 */
export function primeiraParcelaPelaContratacao(dataContratacao: DataISO, descontoEmFolha: boolean, regra: RegraSalario | null | undefined): DataISO {
  const mesSeguinte = adicionarMeses(dataContratacao, 1);
  if (descontoEmFolha && regra) {
    const { ano, mes } = partesDaData(mesSeguinte);
    return diaDoSalario(ano, mes, regra);
  }
  return mesSeguinte;
}

export function resumirEmprestimo(e: Emprestimo, pagamentos: PagamentoParcela[], hoje: DataISO = hojeISO(), regraSalario?: RegraSalario | null): ResumoEmprestimo {
  const taxaInformadaMes = e.taxaJuros !== null ? converterTaxa(e.taxaJuros, e.periodoTaxa, 'mes') : null;
  const implicita = taxaImplicita(e.valorEmprestado, e.valorParcela, e.numeroParcelas);
  const taxaMensal = taxaInformadaMes ?? implicita;
  const fonteTaxa = taxaInformadaMes !== null ? 'contrato' : implicita !== null ? 'calculada' : null;
  const taxaDiverge = taxaInformadaMes !== null && implicita !== null && Math.abs(taxaInformadaMes - implicita) > 0.05;
  const tabela = taxaMensal !== null ? tabelaDeParcelas(e.valorEmprestado, taxaMensal, e.numeroParcelas, e.sistema) : null;

  const porNumero = new Map(pagamentos.map((p) => [p.numeroParcela, p]));
  const dia = partesDaData(e.dataPrimeiraParcela).dia;
  const parcelas: SituacaoParcela[] = Array.from({ length: e.numeroParcelas }, (_, k) => {
    const numero = k + 1;
    const vencContrato = adicionarMeses(e.dataPrimeiraParcela, k, dia);
    // Consignado em folha: a data que vale é o dia do salário (o desconto é automático)
    const desconto = dataDoDesconto(e, vencContrato, regraSalario);
    const vencimento = desconto ?? vencContrato;
    const vencimentoUtil = desconto ?? proximoDiaUtil(vencimento);
    const linha = tabela?.[k];
    // No SAC a parcela muda todo mês; na Price vale o valor do contrato.
    const valor = e.sistema === 'sac' && linha ? linha.parcela : e.valorParcela;
    let pagamento = porNumero.get(numero);
    let descontadaDoSalario = false;
    if (!pagamento && desconto && desconto <= hoje) {
      pagamento = { emprestimoId: e.id ?? 0, numeroParcela: numero, dataPagamento: desconto, valorPago: valor, lancamentoId: null };
      descontadaDoSalario = true;
    }
    let status: SituacaoParcela['status'] = 'a-vencer';
    let encargos: Encargos | undefined;
    if (pagamento) status = 'paga';
    else if (desconto) status = hoje >= desconto ? 'vence-hoje' : 'a-vencer'; // descontado do salário: não atrasa
    else if (hoje > vencimentoUtil) {
      status = 'atrasada';
      // Atraso conta desde o vencimento do contrato
      encargos = encargosDeAtraso(valor, diferencaEmDias(vencimento, hoje), e.multaAtraso, e.jurosMora, e.periodoMora);
    } else if (hoje >= vencimento) status = 'vence-hoje';
    return { numero, vencimento, vencimentoUtil, valor, juros: linha?.juros ?? null, amortizacao: linha?.amortizacao ?? null, pagamento, descontadaDoSalario, status, encargos };
  });

  const pagas = parcelas.filter((p) => p.status === 'paga').length;
  const faltam = e.numeroParcelas - pagas;
  const atrasadas = parcelas.filter((p) => p.status === 'atrasada');
  const proxima = parcelas.find((p) => p.status !== 'paga') ?? null;

  // Saldo para quitar: valor presente das parcelas que faltam
  const naoPagas = parcelas.filter((p) => p.status !== 'paga');
  const saldo = taxaMensal !== null && e.sistema === 'price'
    ? saldoDevedor(e.valorParcela, taxaMensal, faltam)
    : tabela ? (naoPagas.length ? tabela[naoPagas[0].numero - 1].saldoDepois + tabela[naoPagas[0].numero - 1].amortizacao : 0)
      : naoPagas.reduce((s, p) => s + p.valor, 0);
  const totalRestante = naoPagas.reduce((s, p) => s + p.valor, 0);

  // Parcelas pagas em dia seguidas (da mais recente para trás)
  let sequenciaEmDia = 0;
  for (const p of [...parcelas].reverse()) {
    if (p.status !== 'paga') { if (sequenciaEmDia > 0) break; continue; }
    if (p.descontadaDoSalario || p.pagamento!.dataPagamento <= p.vencimentoUtil) sequenciaEmDia++; else break;
  }

  const totalPago = tabela ? tabela.reduce((s, l) => s + l.parcela, 0) : e.valorParcela * e.numeroParcelas;
  const jurosTotal = Math.max(0, (e.sistema === 'price' ? e.valorParcela * e.numeroParcelas : totalPago) - e.valorEmprestado);
  const percentualQuitado = (pagas / e.numeroParcelas) * 100;
  const status: ResumoEmprestimo['status'] = faltam === 0 ? 'quitado' : atrasadas.length ? 'atrasado' : 'em-dia';

  return {
    emprestimo: e, taxaMensal, fonteTaxa, taxaImplicitaMensal: implicita, taxaDiverge, parcelas, pagas, faltam,
    percentualQuitado, proxima, atrasadas, saldoDevedor: saldo, economiaQuitandoHoje: Math.max(0, totalRestante - saldo),
    parcelaSemJuros: Math.round(e.valorEmprestado / e.numeroParcelas),
    jurosPorParcelaMedio: Math.round(jurosTotal / e.numeroParcelas), jurosTotalContrato: jurosTotal, sequenciaEmDia, status,
    mensagem: e.descontoEmFolha && regraSalario && status !== 'quitado'
      ? { tipo: 'parabens', texto: `Descontado direto do salário: ${pagas} de ${e.numeroParcelas} parcelas já pagas (${formatarPercentual(percentualQuitado, 0)} quitado).${proxima ? ` Próximo desconto: ${formatarData(proxima.vencimento)}, ${formatarMoeda(proxima.valor)}.` : ''}` }
      : mensagemDoContrato({ status, atrasadas, proxima, sequenciaEmDia, percentualQuitado, faltam }, hoje),
  };
}

/** Mensagem de apoio, parabéns ou alerta, conforme a situação do contrato. */
function mensagemDoContrato(r: Pick<ResumoEmprestimo, 'status' | 'atrasadas' | 'proxima' | 'sequenciaEmDia' | 'percentualQuitado' | 'faltam'>, hoje: DataISO): Mensagem {
  if (r.status === 'quitado') return { tipo: 'quitado', texto: 'Contrato quitado! Você está livre dessa dívida.' };
  if (r.atrasadas.length) {
    const p = r.atrasadas[0];
    const enc = p.encargos!;
    const total = r.atrasadas.reduce((s, x) => s + x.encargos!.total, 0);
    const varias = r.atrasadas.length > 1 ? `${r.atrasadas.length} parcelas atrasadas. ` : `Parcela ${p.numero} atrasada há ${enc.diasAtraso} ${enc.diasAtraso === 1 ? 'dia' : 'dias'}. `;
    const longo = enc.diasAtraso >= 30 ? ' Com tanto tempo de atraso, vale procurar o banco para renegociar.' : '';
    return { tipo: 'atraso', texto: `${varias}Pagando hoje: ${formatarMoeda(total)}. Cada dia a mais custa cerca de ${formatarMoeda(r.atrasadas.reduce((s, x) => s + x.encargos!.moraPorDia, 0))}.${longo}` };
  }
  if (r.proxima) {
    const dias = diferencaEmDias(hoje, r.proxima.vencimento);
    if (dias <= 0) return { tipo: 'lembrete', texto: `A parcela ${r.proxima.numero} (${formatarMoeda(r.proxima.valor)}) vence hoje. Pagando hoje, não há acréscimo.` };
    if (dias <= 3) return { tipo: 'lembrete', texto: `A parcela ${r.proxima.numero} (${formatarMoeda(r.proxima.valor)}) vence em ${formatarDiaMes(r.proxima.vencimento)}.` };
  }
  if (r.percentualQuitado >= 50 && r.percentualQuitado < 60) return { tipo: 'parabens', texto: `Metade do caminho! Faltam ${r.faltam} parcelas.` };
  if (r.sequenciaEmDia >= 1) {
    return { tipo: 'parabens', texto: `${r.sequenciaEmDia === 1 ? 'Última parcela paga em dia' : `${r.sequenciaEmDia} parcelas seguidas em dia`}. Você já quitou ${formatarPercentual(r.percentualQuitado, 0)} do contrato. Continue assim!` };
  }
  return { tipo: 'info', texto: r.proxima ? `Próxima parcela: ${formatarData(r.proxima.vencimento)}.` : '' };
}

// ---------- Gravação ----------

export interface DadosEmprestimo extends Omit<Emprestimo, 'id' | 'criadoEm' | 'contratoArquivoId'> {
  /** Parcelas que já tinham sido pagas antes de cadastrar no app. */
  parcelasJaPagas: number;
}

export function validarEmprestimo(d: DadosEmprestimo): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!d.nome.trim()) erros.nome = 'Dê um nome para reconhecer este empréstimo (ex.: Consignado do carro).';
  if (!(d.valorEmprestado > 0)) erros.valorEmprestado = 'Informe o valor que você pegou emprestado.';
  if (!Number.isInteger(d.numeroParcelas) || d.numeroParcelas < 1 || d.numeroParcelas > 600) erros.numeroParcelas = 'Informe o número de parcelas (1 a 600).';
  if (!(d.valorParcela > 0)) erros.valorParcela = 'Informe o valor de cada parcela.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dataPrimeiraParcela)) erros.dataPrimeiraParcela = 'Informe a data da 1ª parcela.';
  if (d.taxaJuros !== null && (d.taxaJuros < 0 || d.taxaJuros > 1000)) erros.taxaJuros = 'Taxa de juros inválida.';
  if (d.multaAtraso < 0 || d.multaAtraso > 100) erros.multaAtraso = 'Multa inválida.';
  if (d.jurosMora < 0 || d.jurosMora > 100) erros.jurosMora = 'Juros de mora inválidos.';
  if (!Number.isInteger(d.parcelasJaPagas) || d.parcelasJaPagas < 0 || d.parcelasJaPagas > d.numeroParcelas) erros.parcelasJaPagas = 'Número de parcelas pagas inválido.';
  return erros;
}

/** Guarda o PDF do contrato no aparelho. */
export async function guardarArquivo(arquivo: File): Promise<number> {
  return banco.arquivos.add({ nome: arquivo.name, tipo: arquivo.type || 'application/pdf', tamanho: arquivo.size, dados: arquivo, criadoEm: new Date().toISOString() });
}

/** Cria um empréstimo. Parcelas já pagas antes viram histórico (sem criar despesas novas). */
export async function criarEmprestimo(d: DadosEmprestimo, contratoArquivoId: number | null): Promise<number> {
  const { parcelasJaPagas, ...dados } = d;
  return banco.transaction('rw', banco.emprestimos, banco.pagamentosParcela, async () => {
    const id = await banco.emprestimos.add({ ...dados, contratoArquivoId, criadoEm: new Date().toISOString() });
    const dia = partesDaData(d.dataPrimeiraParcela).dia;
    // Consignado em folha: as parcelas pagas vêm dos salários recebidos (não precisa gravar)
    const historico = d.descontoEmFolha ? 0 : parcelasJaPagas;
    await banco.pagamentosParcela.bulkAdd(Array.from({ length: historico }, (_, k) => ({
      emprestimoId: id, numeroParcela: k + 1, dataPagamento: adicionarMeses(d.dataPrimeiraParcela, k, dia), valorPago: d.valorParcela, lancamentoId: null,
    })));
    return id;
  });
}

export async function atualizarEmprestimo(id: number, d: DadosEmprestimo, contratoArquivoId: number | null): Promise<void> {
  const { parcelasJaPagas: _ignorado, ...dados } = d;
  const atual = await banco.emprestimos.get(id);
  if (!atual) throw new Error('Empréstimo não encontrado.');
  await banco.emprestimos.put({ ...atual, ...dados, contratoArquivoId, id });
}

/** Exclui o empréstimo, os registros de pagamento e o PDF. As despesas já lançadas continuam (foram gastos reais). */
export async function excluirEmprestimo(id: number): Promise<void> {
  await banco.transaction('rw', banco.emprestimos, banco.pagamentosParcela, banco.arquivos, async () => {
    const e = await banco.emprestimos.get(id);
    if (e?.contratoArquivoId) await banco.arquivos.delete(e.contratoArquivoId);
    await banco.pagamentosParcela.where('emprestimoId').equals(id).delete();
    await banco.emprestimos.delete(id);
  });
}

/** Registra o pagamento de uma parcela e lança a despesa na categoria Dívidas. */
export async function registrarPagamento(e: Emprestimo, numeroParcela: number, valorPago: Centavos, dataPagamento: DataISO): Promise<number> {
  return banco.transaction('rw', banco.pagamentosParcela, banco.lancamentos, banco.categorias, async () => {
    // Categoria Dívidas (se a pessoa renomeou/excluiu: Outros ou a primeira de despesa)
    const dividas = (await banco.categorias.where('nome').equals('Dívidas').first()) ?? (await banco.categorias.where('nome').equals('Outros').first())
      ?? (await banco.categorias.where('tipo').equals('despesa').first());
    const lancamentoId = await banco.lancamentos.add({
      tipo: 'despesa', data: dataPagamento, descricao: `${e.nome} — parcela ${numeroParcela} de ${e.numeroParcelas}`, valor: valorPago,
      categoriaId: dividas!.id!, subcategoriaId: 'parcela-de-emprestimo', forma: 'debito', fixa: false, situacao: 'pago', criadoEm: new Date().toISOString(),
    });
    return banco.pagamentosParcela.add({ emprestimoId: e.id!, numeroParcela, dataPagamento, valorPago, lancamentoId });
  });
}

/** Desfaz um pagamento registrado (apaga também a despesa criada junto). */
export async function desfazerPagamento(pagamentoId: number): Promise<void> {
  await banco.transaction('rw', banco.pagamentosParcela, banco.lancamentos, async () => {
    const p = await banco.pagamentosParcela.get(pagamentoId);
    if (p?.lancamentoId) await banco.lancamentos.delete(p.lancamentoId);
    await banco.pagamentosParcela.delete(pagamentoId);
  });
}
