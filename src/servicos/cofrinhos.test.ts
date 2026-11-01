import { describe, expect, it } from 'vitest';
import type { Cofrinho, MovimentoCofrinho } from '../tipos';
import { resumirCofrinho, textoPrevisao, validarCofrinho, valorIncomum } from './cofrinhos';

const reserva: Cofrinho = { id: 1, nome: 'Reserva de emergência', meta: 5000_00, prazo: null, ondeGuarda: 'tesouro-selic', rendimentoMensal: 0.9, depositoMensal: null, criadoEm: '' };
const mov = (tipo: 'deposito' | 'saque', valor: number, data: string): MovimentoCofrinho => ({ cofrinhoId: 1, tipo, valor, data, via: 'manual', lancamentoId: null });

describe('cofrinho', () => {
  it('saldo, progresso e quanto falta', () => {
    const r = resumirCofrinho(reserva, [mov('deposito', 3000_00, '2026-06-01'), mov('deposito', 500_00, '2026-10-05'), mov('saque', 300_00, '2026-10-20')], '2026-10-30');
    expect(r.saldo).toBe(3200_00);
    expect(r.percentual).toBe(64);
    expect(r.falta).toBe(1800_00);
    expect(r.rendimentoEstimadoMes).toBe(28_80);
  });
  it('previsão pelo ritmo dos últimos 3 meses', () => {
    const r = resumirCofrinho(reserva, [mov('deposito', 3200_00, '2026-05-01'), mov('deposito', 500_00, '2026-08-05'), mov('deposito', 500_00, '2026-09-05'), mov('deposito', 500_00, '2026-10-05')], '2026-10-30');
    expect(r.ritmoMensal).toBe(500_00);
    expect(r.falta).toBe(300_00);
    expect(r.previsao).toMatchObject({ meses: 1, mes: 11, ano: 2026 });
    expect(textoPrevisao(r)).toBe('No ritmo de R$ 500,00 por mês, você chega lá em novembro de 2026.');
  });
  it('com prazo: quanto guardar por mês', () => {
    const r = resumirCofrinho({ ...reserva, prazo: '2027-04-30' }, [mov('deposito', 2000_00, '2026-01-01')], '2026-10-31');
    expect(r.precisaPorMes).toBe(500_00); // R$ 3.000 em 6 meses
  });
  it('meta alcançada', () => {
    const r = resumirCofrinho(reserva, [mov('deposito', 5000_00, '2026-10-01')], '2026-10-30');
    expect(r.atingido).toBe(true);
    expect(textoPrevisao(r)).toBe('Meta alcançada!');
  });
  it('valor fora do comum pede confirmação', () => {
    expect(valorIncomum(30000_00, [300_00])).toBe(true);
    expect(valorIncomum(1000_00, [300_00])).toBe(true);
    expect(valorIncomum(500_00, [300_00])).toBe(false);
    expect(valorIncomum(500_00, [])).toBe(false);
  });
  it('validação', () => {
    expect(validarCofrinho({ ...reserva, nome: '', meta: 0 })).toHaveProperty('nome');
    expect(validarCofrinho(reserva)).toEqual({});
  });
});
