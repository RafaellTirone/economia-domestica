import type { Categoria, Lancamento } from '../tipos';
import { adicionarDias, dataLocalDeInstante, diferencaEmDias, formatarData, partesDaData } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';
import type { ResumoEmprestimo } from './emprestimos';
import { calcularResumo } from './resumo';

// "Precisa da sua atenção": junta, na Visão geral, o que pede ação HOJE —
// contas atrasadas ou vencendo, parcelas de empréstimo, categorias estouradas e backup antigo.

export interface ItemAtencao {
  nivel: 'perigo' | 'alerta' | 'info';
  texto: string;
  link: string;
  rotuloLink: string;
}

/** Contas "a pagar" que contam como conta (parcela do cartão é paga na fatura, fica de fora). */
const contaAPagar = (l: Lancamento) => l.tipo === 'despesa' && l.situacao === 'a_pagar' && !l.parcela;
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function itensDeAtencao({ hoje, lancamentos, categorias, emprestimos, ultimoBackup }: {
  hoje: string;
  lancamentos: Lancamento[];
  categorias: Categoria[];
  emprestimos: ResumoEmprestimo[];
  /** Instante (ISO) do último backup; null = nunca. */
  ultimoBackup: string | null;
}): ItemAtencao[] {
  const itens: ItemAtencao[] = [];

  // 1. Contas atrasadas
  const atrasadas = lancamentos.filter((l) => contaAPagar(l) && l.data < hoje);
  if (atrasadas.length) {
    const total = atrasadas.reduce((s, l) => s + l.valor, 0);
    itens.push({
      nivel: 'perigo', link: '/contas', rotuloLink: 'Ver contas',
      texto: atrasadas.length === 1
        ? `Conta atrasada: ${atrasadas[0].descricao || 'sem nome'} (${formatarMoeda(total)}), venceu em ${formatarData(atrasadas[0].data)}.`
        : `${atrasadas.length} contas atrasadas, somando ${formatarMoeda(total)}.`,
    });
  }

  // 2. Parcelas de empréstimo atrasadas e vencendo em até 3 dias
  for (const r of emprestimos) {
    if (r.atrasadas.length) {
      itens.push({
        nivel: 'perigo', link: `/dividas/${r.emprestimo.id}`, rotuloLink: 'Ver empréstimo',
        texto: `${r.emprestimo.nome}: ${r.atrasadas.length} ${plural(r.atrasadas.length, 'parcela atrasada', 'parcelas atrasadas')}. Quanto antes pagar, menos juros.`,
      });
    } else if (r.proxima && !r.proxima.descontadaDoSalario) {
      const dias = diferencaEmDias(hoje, r.proxima.vencimentoUtil);
      if (dias >= 0 && dias <= 3) {
        itens.push({
          nivel: 'alerta', link: `/dividas/${r.emprestimo.id}`, rotuloLink: 'Ver empréstimo',
          texto: `Parcela ${r.proxima.numero} de ${r.emprestimo.nome} (${formatarMoeda(r.proxima.valor)}) ${dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`}.`,
        });
      }
    }
  }

  // 3. Contas que vencem nos próximos 7 dias
  const limite = adicionarDias(hoje, 7);
  const logo = lancamentos.filter((l) => contaAPagar(l) && l.data >= hoje && l.data <= limite).sort((a, b) => a.data.localeCompare(b.data));
  if (logo.length) {
    const total = logo.reduce((s, l) => s + l.valor, 0);
    const hojeTem = logo.filter((l) => l.data === hoje);
    itens.push({
      nivel: hojeTem.length ? 'alerta' : 'info', link: '/contas', rotuloLink: 'Ver contas',
      texto: logo.length === 1
        ? `${logo[0].descricao || 'Conta'} (${formatarMoeda(total)}) ${logo[0].data === hoje ? 'vence hoje' : `vence em ${formatarData(logo[0].data)}`}.`
        : `${logo.length} contas vencem nos próximos 7 dias, somando ${formatarMoeda(total)}${hojeTem.length ? ` (${hojeTem.length} hoje)` : ''}.`,
    });
  }

  // 4. Orçamento do mês atual: categorias que passaram do limite ou chegaram a 80%
  const { ano, mes } = partesDaData(hoje);
  const doMes = lancamentos.filter((l) => { const p = partesDaData(l.data); return p.ano === ano && p.mes === mes; });
  const resumo = calcularResumo(doMes, categorias);
  for (const c of resumo.porCategoria) {
    if (c.situacao === 'estourou') {
      itens.push({ nivel: 'perigo', link: '/orcamento', rotuloLink: 'Ver orçamento', texto: `${c.categoria.nome} passou do limite do mês: ${formatarMoeda(c.gasto)} de ${formatarMoeda(c.categoria.limiteMensal!)} (${formatarPercentual(c.percentualDoLimite!, 0)}).` });
    } else if (c.situacao === 'atencao') {
      itens.push({ nivel: 'alerta', link: '/orcamento', rotuloLink: 'Ver orçamento', texto: `${c.categoria.nome} já usou ${formatarPercentual(c.percentualDoLimite!, 0)} do limite do mês (restam ${formatarMoeda(c.categoria.limiteMensal! - c.gasto)}).` });
    }
  }

  // 5. Cópia de segurança (só depois que já existe algo para perder)
  if (lancamentos.length > 0 || emprestimos.length > 0) {
    const dias = ultimoBackup ? diferencaEmDias(dataLocalDeInstante(ultimoBackup), hoje) : null;
    if (dias === null) itens.push({ nivel: 'info', link: '/configuracoes', rotuloLink: 'Fazer backup', texto: 'Você ainda não fez uma cópia de segurança. Se o navegador for limpo, os dados se perdem.' });
    else if (dias > 7) itens.push({ nivel: 'info', link: '/configuracoes', rotuloLink: 'Fazer backup', texto: `Sua última cópia de segurança foi há ${dias} dias. Que tal fazer outra?` });
  }

  const ordem = { perigo: 0, alerta: 1, info: 2 };
  return itens.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

export interface FatiaDinheiro { rotulo: string; valor: number; cor: string }

/**
 * "Para onde foi o dinheiro": o que entrou dividido em gastos por categoria (as maiores),
 * o que foi guardado e o que sobrou. Se gastou mais do que entrou, devolve quanto passou.
 */
export function paraOndeFoi(lancamentosDoMes: Lancamento[], categorias: Categoria[], maximo = 5): { fatias: FatiaDinheiro[]; base: number; passou: number } {
  const resumo = calcularResumo(lancamentosDoMes, categorias);
  const gastos = resumo.porCategoria.filter((c) => c.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  const fatias: FatiaDinheiro[] = gastos.slice(0, maximo).map((c) => ({ rotulo: c.categoria.nome, valor: c.gasto, cor: c.categoria.cor }));
  const resto = gastos.slice(maximo).reduce((s, c) => s + c.gasto, 0);
  if (resto > 0) fatias.push({ rotulo: `Outras (${gastos.length - maximo})`, valor: resto, cor: '#8a8984' });
  if (resumo.guardado > 0) fatias.push({ rotulo: 'Guardado nos cofrinhos', valor: resumo.guardado, cor: '#3b2fa8' });
  const usado = resumo.despesas + resumo.guardado;
  const sobrou = resumo.receitas - usado;
  if (sobrou > 0) fatias.push({ rotulo: 'Sobrou', valor: sobrou, cor: '#d9d4c7' });
  return { fatias, base: Math.max(resumo.receitas, usado), passou: sobrou < 0 ? -sobrou : 0 };
}
