import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
import type { Cofrinho, DataISO, Lancamento, Recorrencia } from '../tipos';
import { adicionarDias, diaDoSalario, diferencaEmDias, formatarData, partesDaData, type RegraSalario } from '../utils/datas';
import { formatarMoeda } from '../utils/moeda';
import { lerRegraSalario } from './configuracoes';
import { resumirEmprestimo, type ResumoEmprestimo } from './emprestimos';
import { dataNoMes, mesDe, mesesDaRecorrencia, somarMeses } from './recorrencias';

// Lembretes: (1) arquivo de agenda (.ics) com os vencimentos dos próximos 12 meses, com aviso
// 3 dias antes e no dia — funciona no Google Agenda, no calendário do iPhone e no Outlook;
// (2) notificação no aparelho ao abrir o app, uma vez por dia, com o que vence hoje e logo.
// Nada sai do aparelho: o arquivo é gerado aqui e a pessoa decide onde abrir.

export interface EventoAgenda {
  uid: string;
  data: DataISO;
  titulo: string;
  descricao: string;
}

/** Vencimentos de hoje até 12 meses: contas, parcelas de empréstimo e dias de guardar no cofrinho. */
export function eventosDaAgenda({ hoje, lancamentos, recorrencias, emprestimos, cofrinhos, regraSalario }: {
  hoje: DataISO;
  lancamentos: Lancamento[];
  recorrencias: Recorrencia[];
  emprestimos: ResumoEmprestimo[];
  cofrinhos: Cofrinho[];
  regraSalario: RegraSalario | null;
}): EventoAgenda[] {
  const ate = adicionarDias(hoje, 366);
  const eventos: EventoAgenda[] = [];
  const mesFinal = mesDe(ate);

  // Contas a pagar já lançadas (inclusive as que se repetem); parcelas do cartão ficam de fora (vão na fatura)
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa' || l.situacao !== 'a_pagar' || l.parcela || l.data < hoje || l.data > ate) continue;
    eventos.push({
      uid: l.recorrenciaId ? `conta-${l.recorrenciaId}-${mesDe(l.data)}` : `lancamento-${l.id}`, data: l.data,
      titulo: `Pagar ${l.descricao || 'conta'} — ${formatarMoeda(l.valor)}`,
      descricao: l.recorrenciaId ? 'Conta que se repete todo mês (Nosso Dinheiro).' : 'Conta a pagar (Nosso Dinheiro).',
    });
  }
  // Meses que o app ainda não criou das contas que se repetem
  for (const r of recorrencias.filter((x) => x.tipo === 'despesa')) {
    for (const m of mesesDaRecorrencia(r, mesFinal, mesDe(hoje))) {
      if (lancamentos.some((l) => l.recorrenciaId === String(r.id) && mesDe(l.data) === m)) continue;
      const data = dataNoMes(m, r.dia);
      if (data < hoje || data > ate) continue;
      eventos.push({ uid: `conta-${r.id}-${m}`, data, titulo: `Pagar ${r.descricao || 'conta'} — ${formatarMoeda(r.valor)}`, descricao: 'Conta que se repete todo mês (Nosso Dinheiro).' });
    }
  }
  // Parcelas de empréstimo (o consignado descontado do salário não precisa de lembrete)
  for (const r of emprestimos) {
    for (const p of r.parcelas) {
      if (p.status === 'paga' || p.descontadaDoSalario || r.emprestimo.descontoEmFolha || p.vencimentoUtil < hoje || p.vencimentoUtil > ate) continue;
      eventos.push({
        uid: `parcela-${r.emprestimo.id}-${p.numero}`, data: p.vencimentoUtil,
        titulo: `Parcela ${p.numero}/${r.emprestimo.numeroParcelas} — ${r.emprestimo.nome} — ${formatarMoeda(p.valor)}`,
        descricao: `Vencimento do contrato: ${formatarData(p.vencimento)}. Pagando em dia, não há multa nem juros de atraso.`,
      });
    }
  }
  // Dia de guardar no cofrinho: no dia do salário, para quem definiu quanto guardar por mês
  if (regraSalario) {
    for (const c of cofrinhos.filter((x) => x.depositoMensal)) {
      for (let k = 0; k <= 12; k++) {
        const { ano, mes } = partesDaData(`${somarMeses(mesDe(hoje), k)}-01`);
        const data = diaDoSalario(ano, mes, regraSalario);
        if (data < hoje || data > ate) continue;
        eventos.push({ uid: `cofrinho-${c.id}-${ano}-${mes}`, data, titulo: `Guardar ${formatarMoeda(c.depositoMensal!)} no cofrinho ${c.nome}`, descricao: 'Dia do salário: guarde primeiro, gaste depois.' });
      }
    }
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo));
}

// ---------- Arquivo .ics (padrão iCalendar, RFC 5545) ----------

/** Protege vírgula, ponto e vírgula, barra e quebra de linha, como pede o padrão. */
const escapar = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n').replace(/\u00a0/g, ' ');

/** Linhas com no máximo 75 bytes: o resto continua na linha de baixo, começando com espaço. */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (partes.length ? 74 : 75)) { partes.push(atual); atual = ''; bytes = 0; }
    atual += ch; bytes += b;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

const dataIcs = (d: DataISO) => d.replace(/-/g, '');

export function gerarIcs(eventos: EventoAgenda[], agora = new Date()): string {
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nosso Dinheiro//Lembretes//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Nosso Dinheiro — vencimentos'];
  for (const e of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@nosso-dinheiro`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dataIcs(e.data)}`,
      `DTEND;VALUE=DATE:${dataIcs(adicionarDias(e.data, 1))}`,
      `SUMMARY:${escapar(e.titulo)}`,
      `DESCRIPTION:${escapar(e.descricao)}`,
      'TRANSP:TRANSPARENT',
      // Aviso 3 dias antes (às 9h) e no dia (às 9h)
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(`Em 3 dias: ${e.titulo}`)}`, 'TRIGGER:-P2DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(`Hoje: ${e.titulo}`)}`, 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

// ---------- Aviso ao abrir o app ----------

/** Texto do aviso do dia: o que está atrasado, vence hoje ou nos próximos 3 dias. Null = nada. */
export function textoDoAviso(eventos: EventoAgenda[], atrasadas: number, hoje: DataISO): string | null {
  const hojeLista = eventos.filter((e) => e.data === hoje);
  const logo = eventos.filter((e) => { const d = diferencaEmDias(hoje, e.data); return d >= 1 && d <= 3; });
  const partes: string[] = [];
  if (atrasadas) partes.push(`${atrasadas} ${atrasadas === 1 ? 'conta atrasada' : 'contas atrasadas'}`);
  if (hojeLista.length) partes.push(hojeLista.length === 1 ? `Hoje: ${hojeLista[0].titulo}` : `${hojeLista.length} vencimentos hoje`);
  if (logo.length) partes.push(logo.length === 1 ? `Em breve: ${logo[0].titulo} (${formatarData(logo[0].data)})` : `${logo.length} vencimentos nos próximos 3 dias`);
  return partes.length ? partes.join(' · ') : null;
}

const CHAVE_ATIVO = 'notificacoes';
const CHAVE_ULTIMA = 'ultima-notificacao';

export function useNotificacoesAtivas() {
  return useLiveQuery(async () => (await banco.configuracoes.get(CHAVE_ATIVO))?.valor === true, []);
}

/** Pede permissão ao navegador e liga/desliga o aviso. Devolve se ficou ligado. */
export async function ligarNotificacoes(ligar: boolean): Promise<boolean> {
  if (ligar) {
    if (typeof Notification === 'undefined') return false;
    const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permissao !== 'granted') return false;
  }
  await banco.configuracoes.put({ chave: CHAVE_ATIVO, valor: ligar });
  return ligar;
}

/** Mostra o aviso (no máximo uma vez por dia), se estiver ligado e o navegador permitir. */
export async function avisarAoAbrir(hoje: DataISO, texto: string | null): Promise<boolean> {
  if (!texto || typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  if ((await banco.configuracoes.get(CHAVE_ATIVO))?.valor !== true) return false;
  if ((await banco.configuracoes.get(CHAVE_ULTIMA))?.valor === hoje) return false;
  await banco.configuracoes.put({ chave: CHAVE_ULTIMA, valor: hoje });
  const opcoes = { body: texto, icon: '/icone-192.png', tag: `vencimentos-${hoje}`, lang: 'pt-BR' };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification('Nosso Dinheiro', opcoes);
  else new Notification('Nosso Dinheiro', opcoes);
  return true;
}

/** Lê tudo do aparelho e monta os eventos (para o arquivo da agenda e para o aviso ao abrir). */
export async function carregarEventos(hoje: DataISO): Promise<{ eventos: EventoAgenda[]; atrasadas: number }> {
  const [lancamentos, recorrencias, emps, pagamentos, cofrinhos, regraSalario] = await Promise.all([
    banco.lancamentos.toArray(), banco.recorrencias.toArray(), banco.emprestimos.toArray(), banco.pagamentosParcela.toArray(), banco.cofrinhos.toArray(), lerRegraSalario(),
  ]);
  const emprestimos = emps.map((e) => resumirEmprestimo(e, pagamentos.filter((p) => p.emprestimoId === e.id), hoje, regraSalario)).filter((r) => r.status !== 'quitado');
  const eventos = eventosDaAgenda({ hoje, lancamentos, recorrencias, emprestimos, cofrinhos, regraSalario });
  const atrasadas = lancamentos.filter((l) => l.tipo === 'despesa' && l.situacao === 'a_pagar' && !l.parcela && l.data < hoje).length
    + emprestimos.reduce((s, r) => s + r.atrasadas.length, 0);
  return { eventos, atrasadas };
}
