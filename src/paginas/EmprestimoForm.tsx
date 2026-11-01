import { ArrowLeft, FileCheck2, FileText, FileWarning, Loader2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CampoData } from '../componentes/ui/CampoData';
import { EditorSalario } from '../componentes/ui/EditorSalario';
import { ListaConferencia } from '../componentes/ui/ListaConferencia';
import { useAvisos } from '../hooks/useAvisos';
import { useEmprestimo } from '../hooks/useDados';
import { conferirContrato } from '../servicos/conferenciaContrato';
import { salvarRegraSalario, useRegraSalario } from '../servicos/configuracoes';
import { atualizarEmprestimo, criarEmprestimo, gerarDescontosConsignado, estimarParcelasPagas, guardarArquivo, primeiraParcelaPelaContratacao, validarEmprestimo, type DadosEmprestimo } from '../servicos/emprestimos';
import { converterTaxa, formatarTaxa, NOME_PERIODO, taxaImplicita } from '../servicos/juros';
import { formatarMoeda } from '../utils/moeda';
import { analisarTextoContrato, extrairTextoDoPdf, type TermosLidos } from '../servicos/leitorContrato';
import type { PeriodoTaxa, TipoEmprestimo } from '../tipos';
import { adicionarMeses, descreverRegraSalario, formatarData, formatarMesAno, hojeISO, lerData, partesDaData, type RegraSalario } from '../utils/datas';
import { lerValor } from '../utils/moeda';

// Cadastro/edição de empréstimo. Passo 1 (opcional): anexar o contrato em PDF — o app lê os termos
// e preenche os campos, marcando "lido do contrato" com o trecho de onde saiu. A pessoa confere tudo.

const TIPOS: Record<TipoEmprestimo, string> = {
  consignado: 'Consignado', pessoal: 'Empréstimo pessoal', veiculo: 'Financiamento de veículo', imovel: 'Financiamento de imóvel',
  cartao: 'Cartão parcelado', parentes: 'Com parentes ou amigos', outro: 'Outro',
};
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
/** "1,89" → 1.89; vazio → null */
const lerPct = (t: string): number | null => {
  const s = t.trim().replace('%', '').replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

type Campos = {
  nome: string; instituicao: string; numeroContrato: string; tipo: TipoEmprestimo;
  valorEmprestado: string; numeroParcelas: string; valorParcela: string; dataPrimeiraParcela: string; dataContratacao: string;
  taxaJuros: string; periodoTaxa: PeriodoTaxa; cetAnual: string; sistema: 'price' | 'sac';
  multaAtraso: string; jurosMora: string; periodoMora: PeriodoTaxa; parcelasJaPagas: string; observacao: string;
};

const VAZIO: Campos = {
  nome: '', instituicao: '', numeroContrato: '', tipo: 'pessoal', valorEmprestado: '', numeroParcelas: '', valorParcela: '',
  dataPrimeiraParcela: adicionarMeses(hojeISO(), 1), dataContratacao: '', taxaJuros: '', periodoTaxa: 'mes', cetAnual: '', sistema: 'price',
  multaAtraso: '2', jurosMora: '1', periodoMora: 'mes', parcelasJaPagas: '0', observacao: '',
};

export function EmprestimoForm() {
  const { id: idTexto } = useParams();
  const id = idTexto ? Number(idTexto) : null;
  const editando = id !== null;
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const existente = useEmprestimo(id);

  const [c, setC] = useState<Campos>(VAZIO);
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [trechos, setTrechos] = useState<Partial<Record<string, string>>>({});
  /** Valores exatamente como o app leu no contrato (para avisar se algum for alterado). */
  const [termosLidos, setTermosLidos] = useState<TermosLidos | null>(null);
  const [arquivoNovo, setArquivoNovo] = useState<File | null>(null);
  const [arquivoAtualId, setArquivoAtualId] = useState<number | null>(null);
  const [nomeArquivoAtual, setNomeArquivoAtual] = useState('');
  const [leitura, setLeitura] = useState<{ estado: 'lendo' | 'ok' | 'sem-texto' | 'erro'; texto: string } | null>(null);
  const [conferido, setConferido] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const carregado = useRef(false);
  /** A pessoa mexeu na caixa "Conferido" (aí o app não muda mais sozinho). */
  const conferidoManual = useRef(false);
  // Consignado: desconto direto no salário e o dia em que o salário cai
  const regraSalva = useRegraSalario();
  const [descontoEmFolha, setDescontoEmFolha] = useState(false);
  const [salarioLancado, setSalarioLancado] = useState<'bruto' | 'liquido'>('liquido');
  const [regra, setRegra] = useState<RegraSalario>({ tipo: 'dia', dia: 5 });
  const regraTocada = useRef(false);
  const [primeiraEstimada, setPrimeiraEstimada] = useState(false);
  const jaPagasManual = useRef(false);
  useEffect(() => { if (regraSalva && !regraTocada.current) setRegra(regraSalva); }, [regraSalva]);

  useEffect(() => {
    if (!existente || carregado.current) return;
    carregado.current = true;
    const e = existente.emprestimo;
    setC({
      nome: e.nome, instituicao: e.instituicao, numeroContrato: e.numeroContrato, tipo: e.tipo,
      valorEmprestado: paraCampo(e.valorEmprestado), numeroParcelas: String(e.numeroParcelas), valorParcela: paraCampo(e.valorParcela),
      dataPrimeiraParcela: e.dataPrimeiraParcela, dataContratacao: e.dataContratacao ? formatarData(e.dataContratacao) : '',
      taxaJuros: pct(e.taxaJuros), periodoTaxa: e.periodoTaxa, cetAnual: pct(e.cetAnual), sistema: e.sistema,
      multaAtraso: pct(e.multaAtraso), jurosMora: pct(e.jurosMora), periodoMora: e.periodoMora, parcelasJaPagas: '0', observacao: e.observacao ?? '',
    });
    setTrechos(e.trechos ?? {});
    setLidos(new Set(Object.keys(e.trechos ?? {})));
    setConferido(e.termosConferidos);
    setDescontoEmFolha(!!e.descontoEmFolha);
    setSalarioLancado(e.salarioLancado ?? 'liquido');
    conferidoManual.current = e.termosConferidos && !e.conferenciaAutomatica;
    setArquivoAtualId(e.contratoArquivoId);
    setNomeArquivoAtual(existente.arquivo?.nome ?? '');
  }, [existente]);

  const muda = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setC((x) => ({ ...x, [k]: v }));
    setErros((x) => ({ ...x, [k]: '' }));
  };

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!/pdf$/i.test(arquivo.type) && !/\.pdf$/i.test(arquivo.name)) {
      setLeitura({ estado: 'erro', texto: 'Escolha um arquivo PDF.' });
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      setLeitura({ estado: 'erro', texto: 'O arquivo passa de 20 MB. Tente uma versão menor do PDF.' });
      return;
    }
    setArquivoNovo(arquivo);
    setConferido(false);
    conferidoManual.current = false;
    setLeitura({ estado: 'lendo', texto: 'Lendo o contrato no seu aparelho…' });
    try {
      const { texto, paginas, temTexto } = await extrairTextoDoPdf(arquivo);
      if (!temTexto) {
        setLeitura({ estado: 'sem-texto', texto: 'Este PDF parece ser uma foto ou digitalização, sem texto para ler. O contrato fica guardado, mas preencha os campos olhando o documento.' });
        return;
      }
      const r = analisarTextoContrato(texto);
      aplicarTermos(r.termos);
      setTermosLidos(r.termos);
      setTrechos(r.trechos);
      setLidos(new Set(Object.keys(r.trechos)));
      setLeitura(r.encontrados > 0
        ? { estado: 'ok', texto: `Li o contrato (${paginas} ${paginas === 1 ? 'página' : 'páginas'}) e encontrei ${r.encontrados} ${r.encontrados === 1 ? 'termo' : 'termos'}. Eles já estão preenchidos abaixo, marcados com “lido do contrato”. Confira cada um com o documento.` }
        : { estado: 'sem-texto', texto: 'Li o contrato, mas não reconheci os termos automaticamente. O contrato fica guardado; preencha os campos olhando o documento.' });
    } catch {
      setLeitura({ estado: 'erro', texto: 'Não foi possível ler este PDF (pode estar protegido por senha ou danificado). O contrato fica guardado; preencha os campos à mão.' });
    }
  }

  function aplicarTermos(t: TermosLidos) {
    setC((x) => ({
      ...x,
      instituicao: t.instituicao ?? x.instituicao,
      numeroContrato: t.numeroContrato ?? x.numeroContrato,
      tipo: t.tipo ?? x.tipo,
      valorEmprestado: t.valorEmprestado ? paraCampo(t.valorEmprestado) : x.valorEmprestado,
      numeroParcelas: t.numeroParcelas ? String(t.numeroParcelas) : x.numeroParcelas,
      valorParcela: t.valorParcela ? paraCampo(t.valorParcela) : x.valorParcela,
      dataPrimeiraParcela: t.dataPrimeiraParcela ?? x.dataPrimeiraParcela,
      dataContratacao: t.dataContratacao ? formatarData(t.dataContratacao) : x.dataContratacao,
      taxaJuros: t.taxaJuros !== undefined ? pct(t.taxaJuros) : x.taxaJuros,
      periodoTaxa: t.periodoTaxa ?? x.periodoTaxa,
      cetAnual: t.cetAnual !== undefined ? pct(Math.round(t.cetAnual * 100) / 100) : x.cetAnual,
      sistema: t.sistema ?? x.sistema,
      multaAtraso: t.multaAtraso !== undefined ? pct(t.multaAtraso) : x.multaAtraso,
      jurosMora: t.jurosMora !== undefined ? pct(t.jurosMora) : x.jurosMora,
      periodoMora: t.periodoMora ?? x.periodoMora,
    }));
    if (t.tipo === 'consignado') setDescontoEmFolha(true);
    // Sem a data da 1ª parcela, mas com a da contratação: o app estima a 1ª parcela
    if (!t.dataPrimeiraParcela && t.dataContratacao) {
      const estimada = primeiraParcelaPelaContratacao(t.dataContratacao, t.tipo === 'consignado', regra);
      setC((x) => ({ ...x, dataPrimeiraParcela: estimada }));
      setPrimeiraEstimada(true);
    } else {
      setPrimeiraEstimada(false);
    }
  }

  function removerContrato() {
    setArquivoNovo(null);
    setArquivoAtualId(null);
    setNomeArquivoAtual('');
    setLeitura(null);
    setLidos(new Set());
    setTrechos({});
    setTermosLidos(null);
  }

  // Valores interpretados (para validar e para a conferência da taxa)
  const valorEmprestado = lerValor(c.valorEmprestado) ?? 0;
  const valorParcela = lerValor(c.valorParcela) ?? 0;
  const numeroParcelas = Number(c.numeroParcelas) || 0;
  const taxaInformada = lerPct(c.taxaJuros);
  const implicita = valorEmprestado && valorParcela && numeroParcelas ? taxaImplicita(valorEmprestado, valorParcela, numeroParcelas) : null;
  const taxaInformadaMes = taxaInformada !== null && !Number.isNaN(taxaInformada) ? converterTaxa(taxaInformada, c.periodoTaxa, 'mes') : null;
  const diverge = implicita !== null && taxaInformadaMes !== null && Math.abs(implicita - taxaInformadaMes) > 0.05;
  const temContrato = !!arquivoNovo || !!arquivoAtualId;
  const conferencia = temContrato && lidos.size > 0 && valorEmprestado > 0 && valorParcela > 0 && numeroParcelas > 0
    ? conferirContrato({
      lidos, valorEmprestado, numeroParcelas, valorParcela,
      taxaJuros: taxaInformada !== null && !Number.isNaN(taxaInformada) ? taxaInformada : null, periodoTaxa: c.periodoTaxa,
      cetAnual: (() => { const v = lerPct(c.cetAnual); return v !== null && !Number.isNaN(v) ? v : null; })(),
      multaAtraso: lerPct(c.multaAtraso) || 0, jurosMora: lerPct(c.jurosMora) || 0, periodoMora: c.periodoMora,
      dataPrimeiraParcela: c.dataPrimeiraParcela, instituicao: c.instituicao.trim(), numeroContrato: c.numeroContrato.trim(),
      dataContratacao: c.dataContratacao.trim() ? lerData(c.dataContratacao) : null,
      originais: termosLidos ? originaisDoContrato(termosLidos) : undefined,
    })
    : null;
  const tudoCerto = conferencia?.tudoCerto ?? false;

  // Parcelas já pagas: calculadas pelo app (consignado: salários recebidos; outros: parcelas vencidas)
  const emFolha = c.tipo === 'consignado' && descontoEmFolha;
  const estimativaPagas = estimarParcelasPagas({ dataPrimeiraParcela: c.dataPrimeiraParcela, numeroParcelas, descontoEmFolha: emFolha }, emFolha ? regra : null);
  useEffect(() => {
    if (!jaPagasManual.current) setC((x) => (x.parcelasJaPagas === String(estimativaPagas) ? x : { ...x, parcelasJaPagas: String(estimativaPagas) }));
  }, [estimativaPagas]);

  // A análise do app marca (ou desmarca) "Conferido" sozinha, até a pessoa mexer na caixa.
  useEffect(() => {
    if (conferencia && !conferidoManual.current) setConferido(tudoCerto);
  }, [tudoCerto, conferencia !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const dataContratacao = c.dataContratacao.trim() ? lerData(c.dataContratacao) : null;
    const dados: DadosEmprestimo = {
      nome: c.nome.trim(), instituicao: c.instituicao.trim(), numeroContrato: c.numeroContrato.trim(), tipo: c.tipo,
      valorEmprestado, numeroParcelas, valorParcela, dataPrimeiraParcela: c.dataPrimeiraParcela, dataContratacao,
      taxaJuros: taxaInformada, periodoTaxa: c.periodoTaxa, cetAnual: lerPct(c.cetAnual), sistema: c.sistema,
      multaAtraso: lerPct(c.multaAtraso) ?? 0, jurosMora: lerPct(c.jurosMora) ?? 0, periodoMora: c.periodoMora,
      trechos, termosConferidos: temContrato ? conferido : false,
      conferenciaAutomatica: !!conferencia && conferido && tudoCerto && !conferidoManual.current, observacao: c.observacao.trim() || undefined,
      parcelasJaPagas: editando ? 0 : emFolha ? estimativaPagas : Number(c.parcelasJaPagas) || 0,
      descontoEmFolha: emFolha,
      salarioLancado: emFolha ? salarioLancado : undefined,
      // Bruto: lança as parcelas descontadas como despesa a partir deste mês (sem repetir o passado)
      lancarDescontoDesde: emFolha && salarioLancado === 'bruto'
        ? (existente?.emprestimo.salarioLancado === 'bruto' && existente.emprestimo.lancarDescontoDesde) || `${hojeISO().slice(0, 7)}-01`
        : null,
    };
    const encontrados = validarEmprestimo(dados);
    if (c.valorEmprestado && lerValor(c.valorEmprestado) === null) encontrados.valorEmprestado = 'Valor inválido. Exemplo: 10.000,00';
    if (c.valorParcela && lerValor(c.valorParcela) === null) encontrados.valorParcela = 'Valor inválido. Exemplo: 385,43';
    if (Number.isNaN(taxaInformada)) encontrados.taxaJuros = 'Taxa inválida. Exemplo: 1,89';
    if (Number.isNaN(lerPct(c.cetAnual))) encontrados.cetAnual = 'CET inválido. Exemplo: 27,58';
    if (Number.isNaN(lerPct(c.multaAtraso))) encontrados.multaAtraso = 'Multa inválida. Exemplo: 2';
    if (Number.isNaN(lerPct(c.jurosMora))) encontrados.jurosMora = 'Juros de mora inválidos. Exemplo: 1';
    if (c.dataContratacao.trim() && !dataContratacao) encontrados.dataContratacao = 'Use o formato dd/mm/aaaa.';
    if (temContrato && lidos.size > 0 && !conferido) encontrados.conferido = 'Confira no contrato os itens marcados com ⚠ e marque esta caixa.';
    setErros(encontrados);
    const ordem = ['nome', 'valorEmprestado', 'numeroParcelas', 'valorParcela', 'dataPrimeiraParcela', 'dataContratacao', 'taxaJuros', 'cetAnual', 'multaAtraso', 'jurosMora', 'parcelasJaPagas', 'conferido'];
    const primeiro = ordem.find((k) => encontrados[k]);
    if (primeiro) { document.getElementById(`campo-${primeiro}`)?.focus(); return; }

    setSalvando(true);
    try {
      let arquivoId = arquivoAtualId;
      if (arquivoNovo) arquivoId = await guardarArquivo(arquivoNovo);
      if (emFolha) await salvarRegraSalario(regra); // o dia do salário vale para o app todo
      if (editando) {
        await atualizarEmprestimo(id!, dados, arquivoId);
        await gerarDescontosConsignado();
        avisar('Empréstimo atualizado.');
        navigate(`/dividas/${id}`, { replace: true });
      } else {
        const novoId = await criarEmprestimo(dados, arquivoId);
        await gerarDescontosConsignado();
        avisar(`“${dados.nome}” cadastrado.`);
        navigate(`/dividas/${novoId}`, { replace: true });
      }
    } finally {
      setSalvando(false);
    }
  }

  if (editando && existente === null) return <p className="text-suave">Empréstimo não encontrado.</p>;
  if (editando && !existente) return <p className="text-suave">Carregando…</p>;

  const origem = (campo: string) => lidos.has(campo) ? <Origem trecho={trechos[campo]} /> : null;

  return (
    <form onSubmit={salvar} noValidate className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1 className="m-0 text-xl font-extrabold md:text-2xl">{editando ? 'Editar empréstimo' : 'Cadastrar empréstimo'}</h1>
      </div>

      {/* 1. Contrato */}
      <Secao titulo="1 · Contrato (opcional, mas recomendado)">
        <p className="m-0 text-sm text-suave">Anexe o contrato em PDF. O app lê a taxa de juros, a multa e os juros de mora <strong className="text-tinta">aqui no seu aparelho</strong> — o arquivo não é enviado para lugar nenhum.</p>
        {temContrato ? (
          <div className="flex items-center gap-3 rounded-2xl border border-borda bg-fundo p-3">
            <FileText size={22} aria-hidden="true" className="shrink-0 text-primaria" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{arquivoNovo?.name ?? nomeArquivoAtual}</span>
            <button type="button" onClick={removerContrato} aria-label="Remover contrato" className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-cartao"><X size={18} aria-hidden="true" /></button>
          </div>
        ) : null}
        <label htmlFor="campo-contrato" className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primaria bg-primaria-clara px-4 text-[15px] font-extrabold text-primaria-escura focus-within:outline focus-within:outline-3 focus-within:outline-primaria">
          <Upload size={20} aria-hidden="true" />{temContrato ? 'Trocar o contrato (PDF)' : 'Anexar contrato (PDF)'}
          <input id="campo-contrato" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void anexar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {leitura && (
          <p role="status" data-testid="resultado-leitura" className={`m-0 flex items-start gap-2 rounded-2xl p-3 text-sm ${leitura.estado === 'ok' ? 'bg-[#E7F6EA] text-ok-texto' : leitura.estado === 'lendo' ? 'bg-primaria-clara text-[#2E2860]' : 'bg-alerta-fundo text-alerta-texto'}`}>
            {leitura.estado === 'lendo' ? <Loader2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin" /> : leitura.estado === 'ok' ? <FileCheck2 size={18} aria-hidden="true" className="mt-0.5 shrink-0" /> : <FileWarning size={18} aria-hidden="true" className="mt-0.5 shrink-0" />}
            <span>{leitura.texto}</span>
          </p>
        )}
      </Secao>

      {/* 2. Identificação */}
      <Secao titulo="2 · Identificação">
        <Campo id="nome" rotulo="Nome do empréstimo" dica="Como você quer chamar (aparece junto do número do contrato)." erro={erros.nome}>
          <input id="campo-nome" value={c.nome} onChange={(e) => muda('nome', e.target.value)} maxLength={60} placeholder="Ex.: Consignado do carro" className={ENTRADA} />
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="instituicao" rotulo="Banco / instituição" origem={origem('instituicao')}>
            <input id="campo-instituicao" value={c.instituicao} onChange={(e) => muda('instituicao', e.target.value)} maxLength={60} className={ENTRADA} />
          </Campo>
          <Campo id="numeroContrato" rotulo="Número do contrato" origem={origem('numeroContrato')}>
            <input id="campo-numeroContrato" value={c.numeroContrato} onChange={(e) => muda('numeroContrato', e.target.value)} maxLength={40} className={ENTRADA} />
          </Campo>
        </div>
        <Campo id="tipo" rotulo="Tipo" origem={origem('tipo')}>
          <select id="campo-tipo" value={c.tipo} onChange={(e) => { muda('tipo', e.target.value as TipoEmprestimo); setDescontoEmFolha(e.target.value === 'consignado'); }} className={ENTRADA}>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
      </Secao>

      {/* 3. Valores e juros */}
      <Secao titulo="3 · Valores e juros">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo id="valorEmprestado" rotulo="Valor emprestado (R$)" erro={erros.valorEmprestado} origem={origem('valorEmprestado')}>
            <input id="campo-valorEmprestado" inputMode="decimal" value={c.valorEmprestado} onChange={(e) => muda('valorEmprestado', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="10.000,00" className={ENTRADA} />
          </Campo>
          <Campo id="numeroParcelas" rotulo="Nº de parcelas" erro={erros.numeroParcelas} origem={origem('numeroParcelas')}>
            <input id="campo-numeroParcelas" inputMode="numeric" value={c.numeroParcelas} onChange={(e) => muda('numeroParcelas', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="36" className={ENTRADA} />
          </Campo>
          <Campo id="valorParcela" rotulo="Valor da parcela (R$)" erro={erros.valorParcela} origem={origem('valorParcela')}>
            <input id="campo-valorParcela" inputMode="decimal" value={c.valorParcela} onChange={(e) => muda('valorParcela', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="385,43" className={ENTRADA} />
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="dataPrimeiraParcela" rotulo="Vencimento da 1ª parcela" erro={erros.dataPrimeiraParcela} origem={origem('dataPrimeiraParcela')}
            dica={primeiraEstimada ? 'Estimada pela data da contratação (o contrato não informa). Confira.' : undefined}>
            <CampoData id="campo-dataPrimeiraParcela" rotulo="Vencimento da 1ª parcela" valor={c.dataPrimeiraParcela} aoMudar={(d) => { muda('dataPrimeiraParcela', d); setPrimeiraEstimada(false); }} />
          </Campo>
          <Campo id="dataContratacao" rotulo="Data da contratação (opcional)" erro={erros.dataContratacao} origem={origem('dataContratacao')}>
            <input id="campo-dataContratacao" inputMode="numeric" value={c.dataContratacao} onChange={(e) => muda('dataContratacao', e.target.value.replace(/[^\d/]/g, '').slice(0, 10))} placeholder="dd/mm/aaaa" className={ENTRADA} />
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="taxaJuros" rotulo="Taxa de juros do contrato (%)" dica="Se não souber, deixe em branco: o app calcula pelas parcelas." erro={erros.taxaJuros} origem={origem('taxaJuros')}>
            <div className="flex gap-2">
              <input id="campo-taxaJuros" inputMode="decimal" value={c.taxaJuros} onChange={(e) => muda('taxaJuros', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="1,89" className={CAMPO_COM_PERIODO} />
              <label htmlFor="campo-periodoTaxa" className="sr-only">Período da taxa</label>
              <select id="campo-periodoTaxa" value={c.periodoTaxa} onChange={(e) => muda('periodoTaxa', e.target.value as PeriodoTaxa)} className={SELETOR_PERIODO}>
                {(['mes', 'ano', 'dia'] as const).map((p) => <option key={p} value={p}>{NOME_PERIODO[p]}</option>)}
              </select>
            </div>
          </Campo>
          <Campo id="cetAnual" rotulo="CET — custo efetivo total (% ao ano, opcional)" erro={erros.cetAnual} origem={origem('cetAnual')}>
            <input id="campo-cetAnual" inputMode="decimal" value={c.cetAnual} onChange={(e) => muda('cetAnual', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="27,58" className={ENTRADA} />
          </Campo>
        </div>
        {implicita !== null && (
          <p className={`m-0 rounded-2xl p-3 text-sm ${diverge ? 'bg-alerta-fundo text-alerta-texto' : 'bg-fundo text-tinta'}`} data-testid="conferencia-taxa">
            <strong>Conferência:</strong> pelas parcelas, a taxa é de <strong>{formatarTaxa(implicita)} ao mês</strong> ({formatarTaxa(converterTaxa(implicita, 'mes', 'ano'))} ao ano).
            {diverge && <> Isso é diferente da taxa informada ({formatarTaxa(taxaInformadaMes!)} ao mês). Pode haver seguro ou tarifas embutidos na parcela — veja o CET no contrato.</>}
            {!diverge && taxaInformadaMes !== null && <> Bate com a taxa do contrato.</>}
          </p>
        )}
        <Campo id="sistema" rotulo="Como as parcelas são calculadas" origem={origem('sistema')}>
          <select id="campo-sistema" value={c.sistema} onChange={(e) => muda('sistema', e.target.value as 'price' | 'sac')} className={ENTRADA}>
            <option value="price">Parcelas iguais (Tabela Price)</option>
            <option value="sac">Parcelas que diminuem (SAC)</option>
          </select>
        </Campo>
      </Secao>

      {/* 4. Atraso */}
      <Secao titulo="4 · Se atrasar (conforme o contrato)">
        <p className="m-0 text-sm text-suave">Se o contrato não disser, o comum no Brasil é multa de 2% (limite do Código de Defesa do Consumidor) e juros de mora de 1% ao mês.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="multaAtraso" rotulo="Multa por atraso (%, cobrada uma vez)" erro={erros.multaAtraso} origem={origem('multaAtraso')}>
            <input id="campo-multaAtraso" inputMode="decimal" value={c.multaAtraso} onChange={(e) => muda('multaAtraso', e.target.value.replace(/[^\d.,]/g, ''))} className={ENTRADA} />
          </Campo>
          <Campo id="jurosMora" rotulo="Juros de mora (%)" erro={erros.jurosMora} origem={origem('jurosMora')}>
            <div className="flex gap-2">
              <input id="campo-jurosMora" inputMode="decimal" value={c.jurosMora} onChange={(e) => muda('jurosMora', e.target.value.replace(/[^\d.,]/g, ''))} className={CAMPO_COM_PERIODO} />
              <label htmlFor="campo-periodoMora" className="sr-only">Período dos juros de mora</label>
              <select id="campo-periodoMora" value={c.periodoMora} onChange={(e) => muda('periodoMora', e.target.value as PeriodoTaxa)} className={SELETOR_PERIODO}>
                {(['mes', 'dia', 'ano'] as const).map((p) => <option key={p} value={p}>{NOME_PERIODO[p]}</option>)}
              </select>
            </div>
          </Campo>
        </div>
      </Secao>

      {c.tipo === 'consignado' && (
        <Secao titulo="5 · Desconto no salário">
          <label className="flex min-h-11 items-start gap-3 text-[15px]">
            <input id="campo-descontoEmFolha" type="checkbox" checked={descontoEmFolha} onChange={(e) => setDescontoEmFolha(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-primaria" />
            <span><strong>As parcelas são descontadas direto do meu salário</strong><br /><span className="text-sm text-suave">O app marca cada parcela como paga no dia do salário — você não precisa registrar.</span></span>
          </label>
          {descontoEmFolha && (
            <div className="flex flex-col gap-1">
              <p className="m-0 text-sm font-bold" id="rotulo-salario">Dia do pagamento do salário</p>
              <EditorSalario valor={regra} aoMudar={(r) => { regraTocada.current = true; setRegra(r); }} prefixo="campo-salario" />
              <p className="m-0 text-xs text-suave">Fica guardado para o app todo; dá para mudar em Configurações.</p>
              <fieldset className="m-0 mt-3 border-0 p-0">
                <legend className="p-0 text-sm font-bold">Como você lança o seu salário no app?</legend>
                <label className="mt-1 flex min-h-11 items-start gap-3 text-[15px]">
                  <input type="radio" name="salarioLancado" checked={salarioLancado === 'liquido'} onChange={() => setSalarioLancado('liquido')} className="mt-1 h-5 w-5 shrink-0 accent-primaria" />
                  <span>O valor que cai na conta (líquido)<br /><span className="text-sm text-suave">A parcela já veio descontada: o app não lança nada, só marca como paga.</span></span>
                </label>
                <label className="flex min-h-11 items-start gap-3 text-[15px]">
                  <input type="radio" name="salarioLancado" checked={salarioLancado === 'bruto'} onChange={() => setSalarioLancado('bruto')} className="mt-1 h-5 w-5 shrink-0 accent-primaria" />
                  <span>O valor do holerite (bruto)<br /><span className="text-sm text-suave">O app lança a parcela como despesa no dia do salário, todo mês, a partir deste mês.</span></span>
                </label>
              </fieldset>
            </div>
          )}
        </Secao>
      )}

      {!editando && (
        <Secao titulo={`${c.tipo === 'consignado' ? '6' : '5'} · Parcelas já pagas`}>
          {emFolha ? (
            <p className="m-0 rounded-2xl bg-[#E7F6EA] p-3 text-sm text-ok-texto" data-testid="parcelas-calculadas">
              <strong>{estimativaPagas} {estimativaPagas === 1 ? 'parcela já descontada' : 'parcelas já descontadas'}</strong> — o app contou os salários recebidos ({descreverRegraSalario(regra)}){estimativaPagas > 0 ? ` de ${formatarMesAno(partesDaData(c.dataPrimeiraParcela).ano, partesDaData(c.dataPrimeiraParcela).mes)} até hoje` : ''}{c.dataContratacao ? `, desde a contratação em ${c.dataContratacao}` : ''}.
            </p>
          ) : (
            <Campo id="parcelasJaPagas" rotulo="Quantas parcelas você já pagou?" erro={erros.parcelasJaPagas}
              dica={`Calculado pelo app: ${estimativaPagas} ${estimativaPagas === 1 ? 'parcela venceu' : 'parcelas venceram'} até hoje. Ajuste se alguma não foi paga.`}>
              <input id="campo-parcelasJaPagas" inputMode="numeric" value={c.parcelasJaPagas} onChange={(e) => { jaPagasManual.current = true; muda('parcelasJaPagas', e.target.value.replace(/\D/g, '').slice(0, 3)); }} className={ENTRADA} />
            </Campo>
          )}
        </Secao>
      )}

      <Campo id="observacao" rotulo="Observação (opcional)">
        <textarea id="campo-observacao" rows={2} maxLength={500} value={c.observacao} onChange={(e) => muda('observacao', e.target.value)} className={`${ENTRADA} py-2`} />
      </Campo>

      {conferencia && (
        <section aria-label="Conferência automática do contrato" className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
          <h2 className="m-0 text-sm font-extrabold text-suave">Conferência automática do contrato</h2>
          <p className={`m-0 text-sm font-bold ${tudoCerto ? 'text-ok-texto' : 'text-alerta-texto'}`} data-testid="resumo-conferencia">
            {tudoCerto
              ? `O app analisou o contrato e tudo confere (${conferencia.itens.filter((i) => i.situacao === 'ok').length} de ${conferencia.itens.length} itens encontrados).`
              : `O app analisou o contrato e encontrou ${conferencia.pendencias} ${conferencia.pendencias === 1 ? 'ponto' : 'pontos'} para você conferir (marcados com ⚠ e borda).`}
          </p>
          <ListaConferencia conferencia={conferencia} />
        </section>
      )}

      {temContrato && (
        <div>
          <label className={`flex min-h-12 items-start gap-3 rounded-2xl border p-3 text-[15px] ${erros.conferido ? 'border-status-perigo' : conferido ? 'border-[#BFE5C8] bg-[#E7F6EA]' : 'border-borda bg-cartao'}`}>
            <input id="campo-conferido" type="checkbox" checked={conferido} onChange={(e) => { conferidoManual.current = true; setConferido(e.target.checked); setErros((x) => ({ ...x, conferido: '' })); }} className="mt-0.5 h-6 w-6 shrink-0 accent-primaria" />
            <span><strong>{conferencia && tudoCerto && !conferidoManual.current ? 'Conferido automaticamente pela análise do app.' : 'Conferi os valores acima com o contrato.'}</strong><br />
              <span className="text-sm text-suave">{conferencia && !tudoCerto && !conferido ? 'Olhe no contrato os itens com ⚠ e marque esta caixa.' : 'O app usa esses termos para calcular juros e atrasos. Você pode desmarcar se algo estiver errado.'}</span></span>
          </label>
          {erros.conferido && <p role="alert" className="m-0 mt-1 text-sm font-bold text-perigo-texto">{erros.conferido}</p>}
        </div>
      )}

      <button type="submit" disabled={salvando || leitura?.estado === 'lendo'} className="min-h-14 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white hover:bg-primaria-escura disabled:opacity-60">
        {editando ? 'Salvar alterações' : 'Salvar empréstimo'}
      </button>
    </form>
  );
}

/** Valores lidos do contrato, no mesmo formato que a lista de conferência mostra. */
function originaisDoContrato(t: TermosLidos): Partial<Record<string, string>> {
  const o: Partial<Record<string, string>> = {};
  if (t.valorEmprestado) o.valorEmprestado = formatarMoeda(t.valorEmprestado);
  if (t.numeroParcelas) o.numeroParcelas = String(t.numeroParcelas);
  if (t.valorParcela) o.valorParcela = formatarMoeda(t.valorParcela);
  if (t.taxaJuros !== undefined) o.taxa = `${formatarTaxa(t.taxaJuros)} ${NOME_PERIODO[t.periodoTaxa ?? 'mes']}`;
  if (t.multaAtraso !== undefined) o.multa = formatarTaxa(t.multaAtraso);
  if (t.jurosMora !== undefined) o.mora = `${formatarTaxa(t.jurosMora)} ${NOME_PERIODO[t.periodoMora ?? 'mes']}`;
  if (t.dataPrimeiraParcela) o.datas = formatarData(t.dataPrimeiraParcela);
  return o;
}

const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';
// Campo de taxa + seletor de período lado a lado (o número fica com a maior parte da largura)
const CAMPO_COM_PERIODO = 'min-h-12 min-w-0 flex-1 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';
const SELETOR_PERIODO = 'min-h-12 w-28 shrink-0 rounded-xl border border-borda-forte bg-cartao px-2 text-base text-tinta';

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
      <h2 className="m-0 text-sm font-extrabold text-suave">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ id, rotulo, dica, erro, origem, children }: { id: string; rotulo: string; dica?: string; erro?: string; origem?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`campo-${id}`} className="text-sm font-bold">{rotulo}</label>
      {children}
      {origem}
      {dica && !erro && <p className="m-0 text-xs text-suave">{dica}</p>}
      {erro && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erro}</p>}
    </div>
  );
}

/** Selo "lido do contrato" com o trecho de onde o valor saiu. */
function Origem({ trecho }: { trecho?: string }) {
  return (
    <details className="text-xs">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-lg bg-primaria-clara px-2 font-bold text-primaria-escura">
        <FileCheck2 size={13} aria-hidden="true" />lido do contrato · ver trecho
      </summary>
      {trecho && <q className="mt-1 block rounded-lg bg-fundo p-2 text-suave">{trecho}</q>}
    </details>
  );
}
