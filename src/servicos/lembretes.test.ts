import { describe, expect, it } from 'vitest';
import type { Lancamento, Recorrencia } from '../tipos';
import { eventosDaAgenda, gerarIcs, textoDoAviso } from './lembretes';

const hoje = '2026-10-20';
const rec: Recorrencia = { id: 1, tipo: 'despesa', descricao: 'Aluguel', valor: 135000, categoriaId: 1, forma: 'pix', dia: 10, inicio: '2026-10', fim: null, pulados: ['2026-12'], criadoEm: '' };
const l = (p: Partial<Lancamento>): Lancamento => ({ tipo: 'despesa', data: '2026-10-25', descricao: 'IPVA', valor: 50000, categoriaId: 3, forma: 'pix', fixa: false, situacao: 'a_pagar', criadoEm: '', ...p });

describe('lembretes', () => {
  const eventos = eventosDaAgenda({
    hoje, recorrencias: [rec], emprestimos: [], cofrinhos: [{ id: 3, nome: 'Reserva', meta: 1, prazo: null, ondeGuarda: 'cdb', rendimentoMensal: null, depositoMensal: 30000, criadoEm: '' }],
    regraSalario: { tipo: 'dia', dia: 5 },
    lancamentos: [
      l({}), l({ id: 9, data: '2026-10-10', descricao: 'Aluguel', valor: 135000, recorrenciaId: '1', situacao: 'pago' }),
      l({ descricao: 'TV', data: '2026-11-02', parcela: { numero: 2, total: 5, grupoId: 'x' } }),
    ],
  });

  it('monta os vencimentos dos próximos 12 meses, sem os pagos, pulados nem parcelas do cartão', () => {
    const aluguel = eventos.filter((e) => e.titulo.startsWith('Pagar Aluguel')).map((e) => e.data);
    expect(aluguel[0]).toBe('2026-11-10');
    expect(aluguel).not.toContain('2026-12-10');
    expect(aluguel).toHaveLength(11);
    expect(eventos.some((e) => e.titulo.includes('IPVA'))).toBe(true);
    expect(eventos.some((e) => e.titulo.includes('TV'))).toBe(false);
    expect(eventos.filter((e) => e.titulo.includes('cofrinho Reserva'))[0].data).toBe('2026-11-05');
  });

  it('gera um .ics válido: CRLF, datas de dia inteiro, avisos 3 dias antes e no dia, texto protegido', () => {
    const ics = gerarIcs([{ uid: 'x', data: '2026-11-10', titulo: 'Pagar Luz, água; gás', descricao: 'linha 1\nlinha 2' }], new Date('2026-10-20T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111');
    expect(ics).toContain('SUMMARY:Pagar Luz\\, água\\; gás');
    expect(ics).toContain('DESCRIPTION:linha 1\\nlinha 2');
    expect(ics).toContain('TRIGGER:-P2DT15H');
    expect(ics).toContain('TRIGGER:PT9H');
    expect(ics).toContain('DTSTAMP:20261020T120000Z');
    expect(ics.split('\r\n').every((linha) => new TextEncoder().encode(linha).length <= 75)).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('linhas longas são dobradas no padrão (continuação começa com espaço)', () => {
    const ics = gerarIcs([{ uid: 'y', data: '2026-11-10', titulo: 'Á'.repeat(100), descricao: '' }]);
    const linhas = ics.split('\r\n');
    const i = linhas.findIndex((x) => x.startsWith('SUMMARY:'));
    expect(linhas[i + 1].startsWith(' ')).toBe(true);
    expect((linhas[i] + linhas[i + 1].slice(1) + linhas[i + 2].slice(1)).length).toBeGreaterThanOrEqual(108);
  });

  it('texto do aviso ao abrir', () => {
    expect(textoDoAviso([], 0, hoje)).toBeNull();
    const t = textoDoAviso([{ uid: 'a', data: hoje, titulo: 'Pagar Luz — R$ 187,40', descricao: '' }, { uid: 'b', data: '2026-10-22', titulo: 'Pagar Água', descricao: '' }], 1, hoje)!;
    expect(t).toBe('1 conta atrasada · Hoje: Pagar Luz — R$ 187,40 · Em breve: Pagar Água (22/10/2026)');
  });
});
