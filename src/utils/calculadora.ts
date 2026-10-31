// Conta da calculadora, sem usar eval: lê números e operações e respeita a ordem
// (× e ÷ antes de + e −), como as calculadoras de celular.
// Porcentagem como no celular: "100 + 10%" = 110; "200 × 10%" = 20; "50%" = 0,5.

export type Operacao = '+' | '−' | '×' | '÷';
type Pedaco = { tipo: 'numero'; valor: number; porcento: boolean } | { tipo: 'op'; op: Operacao };

export const OPERACOES: Operacao[] = ['+', '−', '×', '÷'];

/** Separa a expressão em números e operações. Aceita vírgula ou ponto como decimal. */
function separar(expr: string): Pedaco[] | null {
  const pedacos: Pedaco[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d*)?|[.,]\d+)(%?)|([+−×÷\-*/x]))/gy;
  let m: RegExpExecArray | null;
  let fim = 0;
  while ((m = re.exec(expr)) !== null) {
    fim = re.lastIndex;
    if (m[1] !== undefined) pedacos.push({ tipo: 'numero', valor: Number(m[1].replace(',', '.')), porcento: m[2] === '%' });
    else {
      const op = ({ '-': '−', '*': '×', x: '×', '/': '÷' } as Record<string, Operacao>)[m[3]] ?? (m[3] as Operacao);
      pedacos.push({ tipo: 'op', op });
    }
    if (re.lastIndex >= expr.length) break;
  }
  if (expr.slice(fim).trim()) return null;
  return pedacos;
}

/**
 * Calcula a expressão. Devolve null se estiver incompleta ou impossível (ex.: dividir por zero).
 * Uma operação sobrando no fim é ignorada ("10 + 5 +" = 15), para o resultado ir aparecendo enquanto digita.
 */
export function calcular(expr: string): number | null {
  let p = separar(expr);
  if (!p || !p.length) return null;
  if (p[p.length - 1].tipo === 'op') p = p.slice(0, -1);
  // Número negativo no começo: "− 5 + 3"
  if (p[0]?.tipo === 'op' && p[0].op === '−' && p[1]?.tipo === 'numero') p = [{ tipo: 'numero', valor: -p[1].valor, porcento: p[1].porcento }, ...p.slice(2)];
  if (!p.length || p.length % 2 === 0) return null;
  for (let i = 0; i < p.length; i++) if ((i % 2 === 0) !== (p[i].tipo === 'numero')) return null;

  let total = 0; // soma dos termos já fechados
  let sinal = 1;
  let i = 0;
  while (i < p.length) {
    // Um termo: números ligados por × e ÷
    const primeiro = p[i] as Extract<Pedaco, { tipo: 'numero' }>;
    const sozinho = !(p[i + 1]?.tipo === 'op' && ['×', '÷'].includes((p[i + 1] as { op: Operacao }).op));
    let termo = primeiro.porcento ? (i > 0 && sozinho ? total * primeiro.valor / 100 : primeiro.valor / 100) : primeiro.valor;
    i++;
    while (i < p.length && (p[i] as { op: Operacao }).op !== '+' && (p[i] as { op: Operacao }).op !== '−') {
      const op = (p[i] as { op: Operacao }).op;
      const n = p[i + 1] as Extract<Pedaco, { tipo: 'numero' }>;
      const valor = n.porcento ? n.valor / 100 : n.valor;
      if (op === '÷' && valor === 0) return null;
      termo = op === '×' ? termo * valor : termo / valor;
      i += 2;
    }
    total += sinal * termo;
    if (i < p.length) { sinal = (p[i] as { op: Operacao }).op === '−' ? -1 : 1; i++; }
  }
  return Number.isFinite(total) ? total : null;
}

/** Resultado em centavos (arredondado), para ir para o campo de valor. */
export function emCentavos(valor: number): number {
  // toPrecision tira o "lixo" do ponto flutuante (1,005 × 100 = 100,4999…) antes de arredondar
  return Math.round(Number((valor * 100).toPrecision(12)));
}

/** Número no jeito brasileiro, sem casas sobrando: 1234.5 → "1.234,5". */
export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}
