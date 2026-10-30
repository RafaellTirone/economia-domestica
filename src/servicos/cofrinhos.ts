import { banco } from '../db/banco';
import type { Centavos, Cofrinho, DataISO, MovimentoCofrinho, OndeGuarda } from '../tipos';
import { adicionarMeses, diferencaEmDias, formatarMesAno, hojeISO, partesDaData } from '../utils/datas';
import { formatarMoeda } from '../utils/moeda';

// Regras dos cofrinhos: saldo, progresso, previsão de quando chega na meta, rendimento estimado,
// depósitos e saques. Guardar dinheiro NÃO é despesa: vira um lançamento do tipo "Guardei".

export const ONDE_GUARDA: Record<OndeGuarda, { nome: string; descricao: string }> = {
  'tesouro-selic': { nome: 'Tesouro Selic', descricao: 'Título público no seu CPF (B3). Pode sacar quando quiser, cai em até 1 dia útil.' },
  cdb: { nome: 'CDB com liquidez diária', descricao: 'Garantido pelo FGC até R$ 250 mil. Pode sacar na hora.' },
  caixinha: { nome: 'Caixinha / porquinho do banco', descricao: 'Prático para o dia a dia. Quase sempre é um CDB, garantido pelo FGC.' },
  poupanca: { nome: 'Poupança', descricao: 'Garantida pelo FGC. Costuma render menos que as opções acima.' },
  conta: { nome: 'Conta separada', descricao: 'Conta só para a reserva, longe da conta do dia a dia.' },
  outro: { nome: 'Outro', descricao: '' },
};

export interface ResumoCofrinho {
  cofrinho: Cofrinho;
  saldo: Centavos;
  percentual: number;
  falta: Centavos;
  atingido: boolean;
  /** Média guardada por mês nos últimos 3 meses (ou o depósito planejado). */
  ritmoMensal: Centavos;
  /** Mês em que chega na meta no ritmo atual (null = sem ritmo). */
  previsao: { ano: number; mes: number; meses: number } | null;
  /** Para cumprir o prazo: quanto guardar por mês. */
  precisaPorMes: Centavos | null;
  rendimentoEstimadoMes: Centavos;
  movimentos: MovimentoCofrinho[];
}

export function resumirCofrinho(c: Cofrinho, movimentos: MovimentoCofrinho[], hoje: DataISO = hojeISO()): ResumoCofrinho {
  const saldo = movimentos.reduce((s, m) => s + (m.tipo === 'deposito' ? m.valor : -m.valor), 0);
  const falta = Math.max(0, c.meta - saldo);
  const atingido = c.meta > 0 && saldo >= c.meta;

  // Ritmo: depósitos líquidos dos últimos 3 meses ÷ 3; se não houver, o depósito planejado
  const desde = adicionarMeses(hoje, -3);
  const ultimos = movimentos.filter((m) => m.data > desde && m.data <= hoje).reduce((s, m) => s + (m.tipo === 'deposito' ? m.valor : -m.valor), 0);
  const ritmoMensal = Math.max(0, Math.round(ultimos / 3)) || (c.depositoMensal ?? 0);

  let previsao: ResumoCofrinho['previsao'] = null;
  if (!atingido && ritmoMensal > 0) {
    const meses = Math.ceil(falta / ritmoMensal);
    const { ano, mes } = partesDaData(adicionarMeses(hoje, meses));
    previsao = { ano, mes, meses };
  }
  let precisaPorMes: Centavos | null = null;
  if (c.prazo && !atingido) {
    // Meses de calendário até o prazo (out → abr = 6 meses)
    const h = partesDaData(hoje), p = partesDaData(c.prazo);
    const meses = Math.max(1, (p.ano - h.ano) * 12 + (p.mes - h.mes));
    precisaPorMes = diferencaEmDias(hoje, c.prazo) <= 0 ? falta : Math.ceil(falta / meses);
  }
  return {
    cofrinho: c, saldo, percentual: c.meta > 0 ? Math.min(100, (saldo / c.meta) * 100) : 0, falta, atingido, ritmoMensal, previsao, precisaPorMes,
    rendimentoEstimadoMes: c.rendimentoMensal ? Math.round((saldo * c.rendimentoMensal) / 100) : 0,
    movimentos: [...movimentos].sort((a, b) => b.data.localeCompare(a.data) || (b.id ?? 0) - (a.id ?? 0)),
  };
}

/** Frase da previsão: "No ritmo atual, você chega lá em fevereiro de 2027". */
export function textoPrevisao(r: ResumoCofrinho): string {
  if (r.atingido) return 'Meta alcançada!';
  if (!r.previsao) return 'Guarde um valor para o app calcular quando você chega lá.';
  return `No ritmo de ${formatarMoeda(r.ritmoMensal)} por mês, você chega lá em ${formatarMesAno(r.previsao.ano, r.previsao.mes)}.`;
}

export function validarCofrinho(c: Omit<Cofrinho, 'id' | 'criadoEm'>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.nome.trim()) e.nome = 'Dê um nome ao cofrinho (ex.: Reserva de emergência).';
  if (!(c.meta > 0)) e.meta = 'Informe a meta em reais.';
  if (c.rendimentoMensal !== null && (c.rendimentoMensal < 0 || c.rendimentoMensal > 10)) e.rendimentoMensal = 'Rendimento inválido (use % ao mês, ex.: 0,8).';
  return e;
}

async function lancarGuardado(c: Cofrinho, valor: Centavos, data: DataISO, saque: boolean): Promise<number> {
  return banco.lancamentos.add({
    tipo: 'guardado', data, descricao: saque ? `Retirado do cofrinho ${c.nome}` : `Guardado no cofrinho ${c.nome}`,
    // saque entra como valor negativo: o total "guardado" do mês diminui
    valor: saque ? -valor : valor, categoriaId: 0, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: new Date().toISOString(),
  });
}

export async function depositar(c: Cofrinho, valor: Centavos, data: DataISO, via: 'pix' | 'manual'): Promise<number> {
  return banco.transaction('rw', banco.movimentosCofrinho, banco.lancamentos, async () => {
    const lancamentoId = await lancarGuardado(c, valor, data, false);
    return banco.movimentosCofrinho.add({ cofrinhoId: c.id!, tipo: 'deposito', valor, data, via, lancamentoId });
  });
}

export async function sacar(c: Cofrinho, valor: Centavos, data: DataISO): Promise<number> {
  return banco.transaction('rw', banco.movimentosCofrinho, banco.lancamentos, async () => {
    const lancamentoId = await lancarGuardado(c, valor, data, true);
    return banco.movimentosCofrinho.add({ cofrinhoId: c.id!, tipo: 'saque', valor, data, via: 'manual', lancamentoId });
  });
}

export async function desfazerMovimento(id: number): Promise<void> {
  await banco.transaction('rw', banco.movimentosCofrinho, banco.lancamentos, async () => {
    const m = await banco.movimentosCofrinho.get(id);
    if (m?.lancamentoId) await banco.lancamentos.delete(m.lancamentoId);
    await banco.movimentosCofrinho.delete(id);
  });
}

/** Exclui o cofrinho e o histórico dele. Os lançamentos "Guardei" continuam (foram movimentos reais). */
export async function excluirCofrinho(id: number): Promise<void> {
  await banco.transaction('rw', banco.cofrinhos, banco.movimentosCofrinho, banco.desejos, async () => {
    await banco.movimentosCofrinho.where('cofrinhoId').equals(id).delete();
    await banco.desejos.filter((d) => d.cofrinhoId === id).modify({ cofrinhoId: null });
    await banco.cofrinhos.delete(id);
  });
}

/** Valor fora do comum (ex.: R$ 30.000 em vez de R$ 300): pede confirmação antes de gerar o Pix. */
export function valorIncomum(valor: Centavos, depositosAnteriores: Centavos[]): boolean {
  const maior = Math.max(0, ...depositosAnteriores);
  return valor > 5000_00 || (maior > 0 && valor > maior * 3);
}
