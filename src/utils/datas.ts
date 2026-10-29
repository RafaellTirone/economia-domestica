import type { DataISO } from '../tipos';

// Tudo sobre datas, sem fuso horário: as datas são texto 'AAAA-MM-DD'.
// Isso evita o erro clássico em que 01/10 aparece como 30/09 no Brasil (UTC−3).

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NOMES_MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const dois = (n: number) => String(n).padStart(2, '0');

/** Monta 'AAAA-MM-DD' a partir de ano, mês (1–12) e dia. */
export function montarData(ano: number, mes: number, dia: number): DataISO {
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

/** Separa 'AAAA-MM-DD' em números. */
export function partesDaData(iso: DataISO): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano, mes, dia };
}

/** Data de hoje no relógio do aparelho. */
export function hojeISO(agora: Date = new Date()): DataISO {
  return montarData(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

/** '2026-10-29' → '29/10/2026'. */
export function formatarData(iso: DataISO): string {
  const { ano, mes, dia } = partesDaData(iso);
  return `${dois(dia)}/${dois(mes)}/${ano}`;
}

/** '2026-10-29' → '29/10'. */
export function formatarDiaMes(iso: DataISO): string {
  const { mes, dia } = partesDaData(iso);
  return `${dois(dia)}/${dois(mes)}`;
}

/** Quantos dias tem o mês (fevereiro bissexto incluído). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Valida e converte '29/10/2026' → '2026-10-29'. Devolve null se a data não existir. */
export function lerData(texto: string): DataISO | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  return montarData(ano, mes, dia);
}

/**
 * Soma meses mantendo o dia. Se o dia não existir no mês de destino, usa o último dia
 * (ex.: conta do dia 31 cai em 30/11 e em 28/02).
 */
export function adicionarMeses(iso: DataISO, meses: number, diaPreferido?: number): DataISO {
  const { ano, mes, dia } = partesDaData(iso);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const d = Math.min(diaPreferido ?? dia, diasNoMes(novoAno, novoMes));
  return montarData(novoAno, novoMes, d);
}

/** Soma dias. */
export function adicionarDias(iso: DataISO, dias: number): DataISO {
  const { ano, mes, dia } = partesDaData(iso);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return montarData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Dias entre duas datas (b − a). Ex.: de 25/10 a 29/10 = 4. */
export function diferencaEmDias(a: DataISO, b: DataISO): number {
  const pa = partesDaData(a);
  const pb = partesDaData(b);
  return Math.round((Date.UTC(pb.ano, pb.mes - 1, pb.dia) - Date.UTC(pa.ano, pa.mes - 1, pa.dia)) / 86_400_000);
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso: DataISO): number {
  const { ano, mes, dia } = partesDaData(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Nome do dia: 'quinta'. */
export function nomeDoDia(iso: DataISO): string {
  return NOMES_DIAS[diaDaSemana(iso)];
}

/** Segunda-feira da semana da data (a semana do app vai de segunda a domingo). */
export function inicioDaSemana(iso: DataISO): DataISO {
  const dds = diaDaSemana(iso);
  return adicionarDias(iso, dds === 0 ? -6 : 1 - dds);
}

/** Primeiro e último dia do mês, para filtros. */
export function limitesDoMes(ano: number, mes: number): { inicio: DataISO; fim: DataISO } {
  return { inicio: montarData(ano, mes, 1), fim: montarData(ano, mes, diasNoMes(ano, mes)) };
}

/** 'outubro de 2026'. */
export function formatarMesAno(ano: number, mes: number): string {
  return `${NOMES_MESES[mes - 1]} de ${ano}`;
}

/** 'out/2026'. */
export function formatarMesAnoCurto(ano: number, mes: number): string {
  return `${NOMES_MESES_CURTOS[mes - 1]}/${ano}`;
}

export function nomeDoMes(mes: number): string {
  return NOMES_MESES[mes - 1];
}

// ---------- Feriados e dias úteis ----------
// Contas que vencem em fim de semana ou feriado podem ser pagas no próximo dia útil sem multa.
// Considera os feriados nacionais e os dias sem expediente bancário (Carnaval, Sexta-feira Santa,
// Corpus Christi). Feriados estaduais e municipais não entram.

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascoa(ano: number): DataISO {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return montarData(ano, mes, dia);
}

/** Feriados nacionais e dias sem expediente bancário do ano, com o nome. */
export function feriadosDoAno(ano: number): Map<DataISO, string> {
  const pascoa = domingoDePascoa(ano);
  const lista: [DataISO, string][] = [
    [montarData(ano, 1, 1), 'Confraternização Universal'],
    [adicionarDias(pascoa, -48), 'Carnaval'],
    [adicionarDias(pascoa, -47), 'Carnaval'],
    [adicionarDias(pascoa, -2), 'Sexta-feira Santa'],
    [montarData(ano, 4, 21), 'Tiradentes'],
    [montarData(ano, 5, 1), 'Dia do Trabalho'],
    [adicionarDias(pascoa, 60), 'Corpus Christi'],
    [montarData(ano, 9, 7), 'Independência do Brasil'],
    [montarData(ano, 10, 12), 'Nossa Senhora Aparecida'],
    [montarData(ano, 11, 2), 'Finados'],
    [montarData(ano, 11, 15), 'Proclamação da República'],
    [montarData(ano, 12, 25), 'Natal'],
  ];
  // Dia da Consciência Negra é feriado nacional desde 2024 (Lei 14.759/2023).
  if (ano >= 2024) lista.push([montarData(ano, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra']);
  return new Map(lista);
}

export function ehDiaUtil(iso: DataISO): boolean {
  const dds = diaDaSemana(iso);
  if (dds === 0 || dds === 6) return false;
  return !feriadosDoAno(partesDaData(iso).ano).has(iso);
}

/** Se a data cair em fim de semana ou feriado, devolve o próximo dia útil. */
export function proximoDiaUtil(iso: DataISO): DataISO {
  let d = iso;
  while (!ehDiaUtil(d)) d = adicionarDias(d, 1);
  return d;
}
