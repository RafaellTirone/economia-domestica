import type { Centavos, DataISO, PeriodoTaxa } from '../tipos';
import { formatarData } from '../utils/datas';
import { formatarMoeda } from '../utils/moeda';
import { converterTaxa, formatarTaxa, NOME_PERIODO, taxaImplicita } from './juros';

// Conferência automática do contrato: depois da leitura do PDF, o app confere cada termo
// e monta a lista (✓ confere / ⚠ precisa de atenção). Se tudo o que é essencial confere,
// a caixa "Conferido" é marcada sozinha; se algo não bate, a pessoa vê o que olhar.

/** Limite de multa para contratos de consumo (Código de Defesa do Consumidor, art. 52, §1º). */
export const LIMITE_MULTA_CDC = 2;

export interface ItemConferencia {
  id: string;
  situacao: 'ok' | 'atencao';
  /** Nome do item na lista (ex.: "Valor do empréstimo"). */
  rotulo: string;
  /** Valor que o app usou (ex.: "R$ 10.000,00"). */
  valor: string;
  /** Explicação curta do que o app conferiu. */
  texto: string;
  /** Itens essenciais com ⚠ impedem a marcação automática. */
  essencial: boolean;
}

export interface ResultadoConferencia {
  itens: ItemConferencia[];
  /** Tudo o que é essencial confere: pode marcar "Conferido" automaticamente. */
  tudoCerto: boolean;
  pendencias: number;
}

export interface DadosConferencia {
  /** Campos que foram lidos do contrato. */
  lidos: Iterable<string>;
  valorEmprestado: Centavos;
  numeroParcelas: number;
  valorParcela: Centavos;
  taxaJuros: number | null;
  periodoTaxa: PeriodoTaxa;
  cetAnual: number | null;
  multaAtraso: number;
  jurosMora: number;
  periodoMora: PeriodoTaxa;
  dataPrimeiraParcela: DataISO;
  instituicao: string;
  numeroContrato: string;
  dataContratacao?: DataISO | null;
  /** Valores como o app leu no contrato (já formatados), para avisar se a pessoa alterou algum. */
  originais?: Partial<Record<string, string>>;
}

export function conferirContrato(d: DadosConferencia): ResultadoConferencia {
  const lidos = new Set(d.lidos);
  const itens: ItemConferencia[] = [];
  let rotulo = '';
  let valor = '';
  const item = (r: string, v: string) => { rotulo = r; valor = v; };
  const add = (id: string, ok: boolean, essencial: boolean, textoOk: string, textoAtencao: string) => {
    // Valor diferente do que está no contrato (alterado à mão): sempre pede atenção
    const original = d.originais?.[id];
    if (ok && original !== undefined && original !== valor) {
      itens.push({ id, situacao: 'atencao', essencial: true, rotulo, valor, texto: `Diferente do contrato: no contrato está ${original}. Confira qual é o certo.` });
      return;
    }
    itens.push({ id, situacao: ok ? 'ok' : 'atencao', essencial, rotulo, valor, texto: ok ? textoOk : textoAtencao });
  };
  const lidoOuNao = (oQue: string) => [`Encontrado no contrato.`, `${oQue} não encontrado no contrato — confira o valor preenchido.`] as const;

  // 1. Valores principais, um por item
  item('Valor do empréstimo', formatarMoeda(d.valorEmprestado));
  add('valorEmprestado', lidos.has('valorEmprestado'), true, ...lidoOuNao('Valor do empréstimo'));
  item('Número de parcelas', `${d.numeroParcelas}`);
  add('numeroParcelas', lidos.has('numeroParcelas'), true, ...lidoOuNao('Número de parcelas'));
  item('Valor da parcela', formatarMoeda(d.valorParcela));
  add('valorParcela', lidos.has('valorParcela'), true, ...lidoOuNao('Valor da parcela'));

  // 2. Taxa de juros
  const implicita = d.valorEmprestado > 0 && d.valorParcela > 0 && d.numeroParcelas > 0 ? taxaImplicita(d.valorEmprestado, d.valorParcela, d.numeroParcelas) : null;
  const taxaMes = d.taxaJuros !== null ? converterTaxa(d.taxaJuros, d.periodoTaxa, 'mes') : null;
  item('Taxa de juros', taxaMes !== null ? `${formatarTaxa(d.taxaJuros!)} ${NOME_PERIODO[d.periodoTaxa]}` : implicita !== null ? `${formatarTaxa(implicita)} ao mês (calculada)` : '—');
  add('taxa', lidos.has('taxaJuros') && taxaMes !== null, false,
    `Encontrada no contrato${d.periodoTaxa !== 'ano' && taxaMes !== null ? ` (equivale a ${formatarTaxa(converterTaxa(taxaMes, 'mes', 'ano'))} ao ano)` : ''}.`,
    implicita !== null ? `Taxa de juros não encontrada no contrato. O app calculou pelas parcelas: ${formatarTaxa(implicita)} ao mês.` : 'Taxa de juros não encontrada no contrato.');

  // 3. As parcelas batem com a taxa?
  if (taxaMes !== null && implicita !== null) {
    const diverge = Math.abs(implicita - taxaMes) > 0.05;
    item('Parcela confere com a taxa', diverge ? `${formatarTaxa(implicita)} ao mês nas parcelas` : 'Sim');
    add('parcelas-batem', !diverge, true,
      'As parcelas conferem com a taxa de juros do contrato.',
      `As parcelas embutem ${formatarTaxa(implicita)} ao mês, diferente da taxa do contrato (${formatarTaxa(taxaMes)}). Pode haver seguro ou tarifa na parcela — confira o CET.`);
  }

  // 4. Multa
  item('Multa por atraso', formatarTaxa(d.multaAtraso));
  if (lidos.has('multaAtraso')) {
    add('multa', d.multaAtraso <= LIMITE_MULTA_CDC, true,
      'Encontrada no contrato, dentro do limite de 2% do Código de Defesa do Consumidor.',
      'Acima do limite de 2% do Código de Defesa do Consumidor. Confira o contrato e, se for o caso, questione o banco.');
  } else {
    add('multa', false, false, '', 'Não encontrada no contrato; o app usa este valor.');
  }

  // 5. Juros de mora
  item('Juros de mora', `${formatarTaxa(d.jurosMora)} ${NOME_PERIODO[d.periodoMora]}`);
  add('mora', lidos.has('jurosMora'), false, 'Encontrados no contrato.', 'Não encontrados no contrato; o app usa este valor.');

  // 6. Datas
  item('Vencimento da 1ª parcela', formatarData(d.dataPrimeiraParcela));
  add('datas', lidos.has('dataPrimeiraParcela'), false, 'Encontrado no contrato.', 'Não encontrado no contrato — confira a data.');

  // 6b. Data da contratação
  item('Data da contratação', d.dataContratacao ? formatarData(d.dataContratacao) : '—');
  add('contratacao', !!d.dataContratacao && lidos.has('dataContratacao'), false, 'Encontrada no contrato.', 'Não encontrada no contrato.');

  // 7. Identificação
  item('Banco e nº do contrato', [d.instituicao, d.numeroContrato && `nº ${d.numeroContrato}`].filter(Boolean).join(' · ') || '—');
  add('identificacao', lidos.has('numeroContrato') && lidos.has('instituicao'), false, 'Encontrados no contrato.', 'Não encontrados no contrato. Preencha para identificar o contrato.');

  // 8. CET
  item('CET (custo efetivo total)', d.cetAnual !== null ? `${formatarTaxa(d.cetAnual)} ao ano` : '—');
  add('cet', d.cetAnual !== null && lidos.has('cetAnual'), false, 'Encontrado no contrato (inclui juros, tarifas e seguros).', 'Não encontrado no contrato.');

  const pendencias = itens.filter((i) => i.situacao === 'atencao' && i.essencial).length;
  return { itens, tudoCerto: pendencias === 0, pendencias };
}
