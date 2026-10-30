import { describe, expect, it } from 'vitest';
import { conferirContrato, type DadosConferencia } from './conferenciaContrato';

const todos = ['valorEmprestado', 'numeroParcelas', 'valorParcela', 'taxaJuros', 'multaAtraso', 'jurosMora', 'dataPrimeiraParcela', 'numeroContrato', 'instituicao', 'cetAnual'];
const base: DadosConferencia = {
  lidos: todos, valorEmprestado: 10000_00, numeroParcelas: 36, valorParcela: 385_43, taxaJuros: 1.89, periodoTaxa: 'mes', cetAnual: 27.58,
  multaAtraso: 2, jurosMora: 1, periodoMora: 'mes', dataPrimeiraParcela: '2025-04-10', instituicao: 'Banco Horizonte S.A.', numeroContrato: '123456789-0',
};

describe('conferência automática do contrato', () => {
  it('contrato completo e coerente: tudo ✓ e marca "Conferido" sozinho', () => {
    const r = conferirContrato(base);
    expect(r.tudoCerto).toBe(true);
    expect(r.itens.every((i) => i.situacao === 'ok')).toBe(true);
    expect(r.itens.map((i) => i.id)).toEqual(['valorEmprestado', 'numeroParcelas', 'valorParcela', 'taxa', 'parcelas-batem', 'multa', 'mora', 'datas', 'identificacao', 'cet']);
    // cada item mostra o valor que o app leu
    const v = Object.fromEntries(r.itens.map((i) => [i.rotulo, i.valor.replace(/\u00a0/g, ' ')]));
    expect(v['Valor do empréstimo']).toBe('R$ 10.000,00');
    expect(v['Valor da parcela']).toBe('R$ 385,43');
    expect(v['Número de parcelas']).toBe('36');
    expect(v['Taxa de juros']).toBe('1,89% ao mês');
    expect(v['Multa por atraso']).toBe('2,00%');
  });
  it('parcela com seguro embutido (não bate com a taxa): ⚠ e não marca sozinho', () => {
    const r = conferirContrato({ ...base, valorParcela: 400_00 });
    expect(r.tudoCerto).toBe(false);
    expect(r.itens.find((i) => i.id === 'parcelas-batem')!.texto).toContain('seguro ou tarifa');
  });
  it('multa acima de 2% (limite do CDC): ⚠ e não marca sozinho', () => {
    const r = conferirContrato({ ...base, multaAtraso: 10 });
    expect(r.tudoCerto).toBe(false);
    expect(r.itens.find((i) => i.id === 'multa')!.texto).toContain('Acima do limite');
  });
  it('valor principal não encontrado no contrato: ⚠ essencial', () => {
    const r = conferirContrato({ ...base, lidos: todos.filter((k) => k !== 'valorParcela') });
    expect(r.tudoCerto).toBe(false);
    const parcela = r.itens.find((i) => i.id === 'valorParcela')!;
    expect(parcela.situacao).toBe('atencao');
    expect(parcela.texto).toContain('não encontrado');
  });
  it('valor alterado à mão (diferente do contrato): ⚠ mostrando o valor do contrato', () => {
    const r = conferirContrato({ ...base, valorParcela: 400_00, originais: { valorParcela: 'R$\u00a0385,43' } });
    const item = r.itens.find((i) => i.id === 'valorParcela')!;
    expect(item.situacao).toBe('atencao');
    expect(item.texto).toContain('no contrato está R$');
    expect(r.tudoCerto).toBe(false);
  });
  it('itens secundários faltando (CET, mora) avisam mas não impedem', () => {
    const r = conferirContrato({ ...base, cetAnual: null, lidos: todos.filter((k) => k !== 'cetAnual' && k !== 'jurosMora') });
    expect(r.tudoCerto).toBe(true);
    expect(r.itens.filter((i) => i.situacao === 'atencao').map((i) => i.id)).toEqual(['mora', 'cet']);
  });
  it('sem taxa no contrato: calcula pelas parcelas e não bloqueia', () => {
    const r = conferirContrato({ ...base, taxaJuros: null, lidos: todos.filter((k) => k !== 'taxaJuros') });
    expect(r.tudoCerto).toBe(true);
    expect(r.itens.find((i) => i.id === 'taxa')!.valor).toBe('1,89% ao mês (calculada)');
  });
});
