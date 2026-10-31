import { describe, expect, it } from 'vitest';
import type { Emprestimo, PagamentoParcela } from '../tipos';
import { estimarParcelasPagas, primeiraParcelaPelaContratacao, resumirEmprestimo, validarEmprestimo, type DadosEmprestimo } from './emprestimos';

// Exemplo dos layouts: R$ 1.000,00 em 10x de R$ 105,58, juros de 1% ao mês, 1ª parcela em 25/06/2026.
const reforma: Emprestimo = {
  id: 1, nome: 'Empréstimo da reforma', instituicao: 'Banco Horizonte', numeroContrato: '0098-7654', tipo: 'pessoal',
  valorEmprestado: 1000_00, numeroParcelas: 10, valorParcela: 105_58, taxaJuros: 1, periodoTaxa: 'mes', cetAnual: null,
  sistema: 'price', dataContratacao: '2026-05-25', dataPrimeiraParcela: '2026-06-25', multaAtraso: 2, jurosMora: 1, periodoMora: 'mes',
  trechos: {}, termosConferidos: true, contratoArquivoId: null, criadoEm: '',
};
const pago = (n: number, data: string): PagamentoParcela => ({ emprestimoId: 1, numeroParcela: n, dataPagamento: data, valorPago: 105_58, lancamentoId: null });
const quatroEmDia = [pago(1, '2026-06-25'), pago(2, '2026-07-24'), pago(3, '2026-08-25'), pago(4, '2026-09-25')];

describe('situação do empréstimo', () => {
  it('parcela 5 (venceu domingo 25/10) está atrasada 4 dias em 29/10, com os encargos do contrato', () => {
    const r = resumirEmprestimo(reforma, quatroEmDia, '2026-10-29');
    const p5 = r.parcelas[4];
    expect(p5.vencimento).toBe('2026-10-25');
    expect(p5.vencimentoUtil).toBe('2026-10-26'); // domingo → segunda
    expect(p5.status).toBe('atrasada');
    expect(p5.encargos).toMatchObject({ diasAtraso: 4, multa: 2_11, mora: 14, total: 107_83 });
    expect(r.status).toBe('atrasado');
    expect(r.mensagem.tipo).toBe('atraso');
    expect(r.mensagem.texto).toContain('R$');
    expect(r.pagas).toBe(4);
    expect(r.faltam).toBe(6);
  });
  it('vencimento em fim de semana: pagar na segunda não é atraso', () => {
    const r = resumirEmprestimo(reforma, quatroEmDia, '2026-10-26');
    expect(r.parcelas[4].status).toBe('vence-hoje'); // ainda dá para pagar sem multa
    expect(r.status).toBe('em-dia');
  });
  it('em dia: mensagem de parabéns com a sequência', () => {
    const r = resumirEmprestimo(reforma, quatroEmDia, '2026-10-10');
    expect(r.sequenciaEmDia).toBe(4);
    expect(r.mensagem.tipo).toBe('parabens');
    expect(r.mensagem.texto).toContain('4 parcelas seguidas em dia');
  });
  it('lembrete 3 dias antes do vencimento', () => {
    const r = resumirEmprestimo(reforma, quatroEmDia, '2026-10-22');
    expect(r.mensagem.tipo).toBe('lembrete');
  });
  it('juros do contrato: parcela sem juros vs com juros', () => {
    const r = resumirEmprestimo(reforma, quatroEmDia, '2026-10-10');
    expect(r.parcelaSemJuros).toBe(100_00);
    expect(r.jurosTotalContrato).toBe(55_80);
    expect(r.jurosPorParcelaMedio).toBe(5_58);
    expect(r.fonteTaxa).toBe('contrato');
    expect(r.taxaDiverge).toBe(false);
    expect(r.saldoDevedor).toBe(611_89);
    expect(r.economiaQuitandoHoje).toBe(633_48 - 611_89);
  });
  it('sem taxa no contrato: calcula pelas parcelas', () => {
    const r = resumirEmprestimo({ ...reforma, taxaJuros: null }, [], '2026-06-01');
    expect(r.fonteTaxa).toBe('calculada');
    expect(r.taxaMensal!.toFixed(2)).toBe('1.00');
  });
  it('avisa quando a taxa do contrato não bate com as parcelas (seguro/tarifa embutidos)', () => {
    const r = resumirEmprestimo({ ...reforma, valorParcela: 110_00 }, [], '2026-06-01');
    expect(r.taxaDiverge).toBe(true);
  });
  it('quitado', () => {
    const todas = Array.from({ length: 10 }, (_, k) => pago(k + 1, '2026-06-25'));
    const r = resumirEmprestimo(reforma, todas, '2027-05-01');
    expect(r.status).toBe('quitado');
    expect(r.saldoDevedor).toBe(0);
    expect(r.mensagem.tipo).toBe('quitado');
  });
});

describe('validação do cadastro', () => {
  const base: DadosEmprestimo = { ...reforma, parcelasJaPagas: 0 };
  it('aceita um cadastro completo', () => expect(validarEmprestimo(base)).toEqual({}));
  it('exige nome, valores e data', () => {
    const e = validarEmprestimo({ ...base, nome: ' ', valorEmprestado: 0, valorParcela: 0, numeroParcelas: 0, dataPrimeiraParcela: '' });
    expect(Object.keys(e).sort()).toEqual(['dataPrimeiraParcela', 'nome', 'numeroParcelas', 'valorEmprestado', 'valorParcela']);
  });
});

describe('consignado: parcelas descontadas do salário', () => {
  const consignado: Emprestimo = { ...reforma, id: 2, tipo: 'consignado', descontoEmFolha: true, numeroParcelas: 36, valorEmprestado: 10000_00, valorParcela: 385_43, taxaJuros: 1.89, dataPrimeiraParcela: '2025-04-10' };
  const salarioDia5 = { tipo: 'dia', dia: 5 } as const;
  it('conta as parcelas pelos salários recebidos (abr/2025 até 30/10/2026 = 19)', () => {
    expect(estimarParcelasPagas(consignado, salarioDia5, '2026-10-30')).toBe(19);
    expect(estimarParcelasPagas(consignado, salarioDia5, '2026-11-04')).toBe(19);
    expect(estimarParcelasPagas(consignado, salarioDia5, '2026-11-05')).toBe(20); // salário de novembro caiu
  });
  it('a situação avança sozinha a cada salário, sem atraso', () => {
    const r = resumirEmprestimo(consignado, [], '2026-10-30', salarioDia5);
    expect(r.pagas).toBe(19);
    expect(r.atrasadas).toHaveLength(0);
    expect(r.proxima!.vencimento).toBe('2026-11-05');
    expect(r.mensagem.texto).toContain('Descontado direto do salário');
    expect(r.sequenciaEmDia).toBe(19);
  });
  it('sem o dia do salário cadastrado, usa as datas do contrato', () => {
    const r = resumirEmprestimo(consignado, [], '2026-10-30', null);
    expect(r.parcelas[0].vencimento).toBe('2025-04-10');
  });
  it('outros empréstimos: estima pelas parcelas já vencidas', () => {
    expect(estimarParcelasPagas(reforma, null, '2026-10-29')).toBe(5);
  });
  it('contrato só com a data de contratação: estima a 1ª parcela', () => {
    expect(primeiraParcelaPelaContratacao('2025-03-10', true, salarioDia5)).toBe('2025-04-04'); // 5/4/2025 é sábado → sexta
    expect(primeiraParcelaPelaContratacao('2025-03-10', false, null)).toBe('2025-04-10');
  });
});

describe('consignado com salário bruto', async () => {
  const { banco } = await import('../db/banco');
  const { gerarDescontosConsignado } = await import('./emprestimos');
  const regra = { tipo: 'dia' as const, dia: 5 };
  const base = {
    nome: 'Consignado', instituicao: '', numeroContrato: '', tipo: 'consignado' as const, valorEmprestado: 1000000, numeroParcelas: 24, valorParcela: 52000,
    taxaJuros: 1.8, periodoTaxa: 'mes' as const, cetAnual: null, sistema: 'price' as const, dataContratacao: null, dataPrimeiraParcela: '2026-06-10',
    multaAtraso: 2, jurosMora: 1, periodoMora: 'mes' as const, trechos: {}, termosConferidos: true, contratoArquivoId: null, criadoEm: '', descontoEmFolha: true,
  };

  it('bruto: lança a parcela como despesa no dia do salário, só a partir do mês escolhido e sem duplicar', async () => {
    await banco.delete(); await banco.open();
    const id = await banco.emprestimos.add({ ...base, salarioLancado: 'bruto', lancarDescontoDesde: '2026-09-01' });
    expect(await gerarDescontosConsignado('2026-10-20', regra)).toBe(2); // 04/09 (05/09 é sábado) e 05/10
    expect(await gerarDescontosConsignado('2026-10-20', regra)).toBe(0);
    const lancs = (await banco.lancamentos.toArray()).sort((a, b) => a.data.localeCompare(b.data));
    expect(lancs.map((l) => [l.data, l.valor, l.tipo])).toEqual([['2026-09-04', 52000, 'despesa'], ['2026-10-05', 52000, 'despesa']]);
    expect((await banco.pagamentosParcela.where('emprestimoId').equals(id).toArray()).map((p) => p.numeroParcela)).toEqual([4, 5]);
    expect(await gerarDescontosConsignado('2026-11-05', regra)).toBe(1);
  });

  it('líquido: não lança nada (a parcela já veio descontada)', async () => {
    await banco.delete(); await banco.open();
    await banco.emprestimos.add({ ...base, salarioLancado: 'liquido', lancarDescontoDesde: null });
    expect(await gerarDescontosConsignado('2026-10-20', regra)).toBe(0);
    expect(await banco.lancamentos.count()).toBe(0);
  });
});
