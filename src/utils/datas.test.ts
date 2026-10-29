import { describe, expect, it } from 'vitest';
import {
  adicionarMeses, diferencaEmDias, domingoDePascoa, ehDiaUtil, formatarData, formatarMesAno, hojeISO,
  inicioDaSemana, lerData, limitesDoMes, proximoDiaUtil,
} from './datas';

describe('formatação de datas (dd/mm/aaaa)', () => {
  it('formata e lê', () => {
    expect(formatarData('2026-10-29')).toBe('29/10/2026');
    expect(lerData('29/10/2026')).toBe('2026-10-29');
    expect(lerData('5/3/2026')).toBe('2026-03-05');
  });
  it('rejeita datas que não existem', () => {
    expect(lerData('31/02/2026')).toBeNull();
    expect(lerData('29/02/2026')).toBeNull();
    expect(lerData('29/02/2028')).toBe('2028-02-29'); // ano bissexto
    expect(lerData('13/13/2026')).toBeNull();
  });
  it('"hoje" usa o relógio local, sem pular de dia por causa do fuso', () => {
    expect(hojeISO(new Date(2026, 9, 1, 23, 30))).toBe('2026-10-01');
    expect(hojeISO(new Date(2026, 9, 1, 0, 5))).toBe('2026-10-01');
  });
  it('nome do mês', () => {
    expect(formatarMesAno(2026, 10)).toBe('outubro de 2026');
  });
});

describe('contas mensais', () => {
  it('conta do dia 31 cai no último dia dos meses curtos', () => {
    expect(adicionarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(adicionarMeses('2026-01-31', 3)).toBe('2026-04-30');
    expect(adicionarMeses('2028-01-31', 1)).toBe('2028-02-29');
    // depois de fevereiro, volta para o dia 31 quando o dia preferido é informado
    expect(adicionarMeses('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
  it('vira o ano', () => {
    expect(adicionarMeses('2026-11-10', 2)).toBe('2027-01-10');
    expect(adicionarMeses('2026-01-10', -1)).toBe('2025-12-10');
  });
  it('limites do mês', () => {
    expect(limitesDoMes(2026, 2)).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  it('dias de atraso', () => {
    expect(diferencaEmDias('2026-10-25', '2026-10-29')).toBe(4);
    expect(diferencaEmDias('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('semana de segunda a domingo', () => {
  it('encontra a segunda-feira', () => {
    expect(inicioDaSemana('2026-10-29')).toBe('2026-10-26'); // quinta → segunda
    expect(inicioDaSemana('2026-11-01')).toBe('2026-10-26'); // domingo pertence à semana anterior
    expect(inicioDaSemana('2026-10-26')).toBe('2026-10-26');
  });
});

describe('feriados e dias úteis', () => {
  it('calcula a Páscoa', () => {
    expect(domingoDePascoa(2026)).toBe('2026-04-05');
    expect(domingoDePascoa(2027)).toBe('2027-03-28');
  });
  it('reconhece feriados nacionais e bancários', () => {
    expect(ehDiaUtil('2026-11-02')).toBe(false); // Finados (segunda)
    expect(ehDiaUtil('2026-11-20')).toBe(false); // Consciência Negra (sexta)
    expect(ehDiaUtil('2026-02-17')).toBe(false); // Carnaval (terça)
    expect(ehDiaUtil('2026-06-04')).toBe(false); // Corpus Christi
    expect(ehDiaUtil('2026-10-29')).toBe(true);
  });
  it('vencimento em fim de semana/feriado passa para o próximo dia útil', () => {
    expect(proximoDiaUtil('2026-10-31')).toBe('2026-11-03'); // sábado → (domingo, Finados) → terça
    expect(proximoDiaUtil('2026-11-10')).toBe('2026-11-10');
  });
});
