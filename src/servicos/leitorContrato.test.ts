import { describe, expect, it } from 'vitest';
import { analisarTextoContrato } from './leitorContrato';

// Texto no estilo de uma Cédula de Crédito Bancário (CCB) de empréstimo consignado.
const contrato = `
CÉDULA DE CRÉDITO BANCÁRIO – EMPRÉSTIMO CONSIGNADO
CCB nº 123456789-0     Data de emissão: 10/03/2025
EMITENTE: FULANO DE TAL, CPF 000.000.000-00
CREDOR: Banco Horizonte S.A., CNPJ 00.000.000/0001-00
QUADRO III – CARACTERÍSTICAS DA OPERAÇÃO
Valor do empréstimo: R$ 10.000,00
Quantidade de parcelas: 36
Valor da parcela: R$ 385,43
Vencimento da 1ª parcela: 10/04/2025
Taxa de juros: 1,89% a.m.   Taxa de juros: 25,19% a.a.
Custo Efetivo Total (CET): 2,05% a.m. e 27,58% a.a.
Sistema de amortização: Tabela Price.
CLÁUSULA 8 – DO INADIMPLEMENTO. No caso de atraso no pagamento de qualquer parcela, incidirão
multa moratória de 2% (dois por cento) sobre o valor em atraso e juros de mora de 1% (um por cento) ao mês,
calculados pro rata die.
`;

describe('leitor de contrato', () => {
  const r = analisarTextoContrato(contrato);
  it('encontra os termos principais', () => {
    expect(r.termos).toMatchObject({
      numeroContrato: '123456789-0', instituicao: 'Banco Horizonte S.A.', tipo: 'consignado',
      valorEmprestado: 10000_00, numeroParcelas: 36, valorParcela: 385_43, dataPrimeiraParcela: '2025-04-10', dataContratacao: '2025-03-10',
      taxaJuros: 1.89, periodoTaxa: 'mes', cetAnual: 27.58, sistema: 'price', multaAtraso: 2, jurosMora: 1, periodoMora: 'mes',
    });
    expect(r.encontrados).toBe(13);
  });
  it('guarda o trecho do contrato de onde tirou cada termo', () => {
    expect(r.trechos.taxaJuros).toContain('1,89% a.m.');
    expect(r.trechos.jurosMora).toContain('juros de mora de 1%');
    expect(r.trechos.multaAtraso).toContain('multa moratória de 2%');
  });
  it('não confunde juros de mora com a taxa do contrato', () => {
    const t = analisarTextoContrato('Juros de mora de 1% ao mês. Taxa de juros remuneratórios de 3,5% ao mês.');
    expect(t.termos.taxaJuros).toBe(3.5);
    expect(t.termos.jurosMora).toBe(1);
  });
  it('entende outras formas de escrever', () => {
    const t = analisarTextoContrato('Contrato número 9988-77. O valor liberado de R$ 1.000,00 será pago em 10 (dez) parcelas mensais de R$ 105,58. Juros de 12,68% ao ano. Juros moratórios de 0,033% ao dia e multa de 2%. Primeiro vencimento em 25/06/2026.');
    expect(t.termos).toMatchObject({ numeroContrato: '9988-77', valorEmprestado: 1000_00, numeroParcelas: 10, valorParcela: 105_58, jurosMora: 0.033, periodoMora: 'dia', multaAtraso: 2, dataPrimeiraParcela: '2026-06-25' });
  });
  it('texto sem termos não inventa nada', () => {
    expect(analisarTextoContrato('Lista de compras: arroz, feijão.').encontrados).toBe(0);
  });
});

describe('leitor de contrato — outras formas de escrever banco, número e data', () => {
  it('rótulo "CREDOR:" e "Nº do contrato:"', () => {
    const t = analisarTextoContrato('CREDOR: Paraná Banco S.A., CNPJ 14.388.334/0001-99. Nº do contrato: 778899-1. Contratado em 05/02/2026.').termos;
    expect(t.instituicao).toBe('Paraná Banco S.A.');
    expect(t.numeroContrato).toBe('778899-1');
    expect(t.dataContratacao).toBe('2026-02-05');
  });
  it('"Instituição financeira:" e "Contrato: 2025/000123"', () => {
    const t = analisarTextoContrato('Instituição Financeira: Banco Daycoval S.A. - CNPJ 62.232.889/0001-90. Contrato: 2025/000123').termos;
    expect(t.instituicao).toBe('Banco Daycoval S.A.');
    expect(t.numeroContrato).toBe('2025/000123');
  });
  it('reconhece banco conhecido pelo nome', () => {
    expect(analisarTextoContrato('Empréstimo consignado contratado junto ao Itaú Consignado para pagamento em folha.').termos.instituicao).toBe('Itaú Consignado');
    expect(analisarTextoContrato('Operação realizada pela Caixa Econômica Federal.').termos.instituicao).toBe('Caixa Econômica Federal');
  });
  it('data por extenso no fim do contrato (local e data)', () => {
    expect(analisarTextoContrato('E por estarem justos e contratados, assinam. Belo Horizonte, 10 de março de 2025.').termos.dataContratacao).toBe('2025-03-10');
    expect(analisarTextoContrato('Local e data: Curitiba/PR, 22/08/2024').termos.dataContratacao).toBe('2024-08-22');
  });
  it('1ª parcela por extenso', () => {
    expect(analisarTextoContrato('Vencimento da primeira parcela: 10 de abril de 2025').termos.dataPrimeiraParcela).toBe('2025-04-10');
  });
});
