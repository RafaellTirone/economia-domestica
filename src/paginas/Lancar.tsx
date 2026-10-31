import { ArrowLeft, Info, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CampoData } from '../componentes/ui/CampoData';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { NOMES_FORMAS } from '../componentes/ui/rotulos';
import { banco } from '../db/banco';
import { useAvisos } from '../hooks/useAvisos';
import { alertaOrcamento, gastoDaCategoriaNoMes } from '../servicos/orcamento';
import { alterarDaquiPraFrente, apagarRepeticao, criarComRepeticao, excluirSoEsteMes, mesDe, passarARepetir, pararDeRepetir } from '../servicos/recorrencias';
import { useCategorias, useLancamento, useTodosLancamentos } from '../hooks/useDados';
import {
  atualizarLancamento, criarLancamento, descricoesFrequentes, dividirEmParcelas, excluirLancamento, LIMITES,
  restaurarLancamento, sugestaoPorDescricao, validarLancamento, type DadosLancamento,
} from '../servicos/lancamentos';
import type { FormaPagamento } from '../tipos';
import { adicionarDias, formatarData, hojeISO, nomeDoDia } from '../utils/datas';
import { formatarMoeda, lerValor } from '../utils/moeda';

// Tela de novo lançamento / edição (Layout C): 1) toque no envelope, 2) valor e detalhes, 3) salvar.

type Tipo = 'despesa' | 'receita';
type Erros = ReturnType<typeof validarLancamento>;

/** Centavos → texto para o campo de valor ("72,00"). */
const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Lancar() {
  const { id: idTexto } = useParams();
  const id = idTexto ? Number(idTexto) : null;
  const editando = id !== null;
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const categorias = useCategorias();
  const historico = useTodosLancamentos();
  const existente = useLancamento(id);
  const hoje = hojeISO();

  // ---- estado do formulário ----
  const [tipo, setTipo] = useState<Tipo>('despesa');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | undefined>();
  const [valorTexto, setValorTexto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [fixa, setFixa] = useState(false);
  const [pago, setPago] = useState(true);
  const [observacao, setObservacao] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [sugerida, setSugerida] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Conta que se repete: a alteração vale só para este mês ou daqui pra frente?
  const [escopo, setEscopo] = useState<'so-este' | 'proximos'>('so-este');
  const [perguntaExcluir, setPerguntaExcluir] = useState(false);
  const categoriaManual = useRef(false);
  const pagoManual = useRef(false);
  const carregado = useRef(false);
  const topo = useRef<HTMLHeadingElement>(null);

  // Ao editar, preenche o formulário uma única vez com o lançamento salvo.
  useEffect(() => {
    if (!existente || carregado.current) return;
    carregado.current = true;
    categoriaManual.current = true;
    pagoManual.current = true;
    setTipo(existente.tipo === 'receita' ? 'receita' : 'despesa');
    setCategoriaId(existente.categoriaId);
    setSubcategoriaId(existente.subcategoriaId);
    setValorTexto(paraCampo(existente.valor));
    setDescricao(existente.descricao);
    setData(existente.data);
    setForma(existente.forma);
    setFixa(existente.fixa);
    setPago(existente.situacao === 'pago');
    setObservacao(existente.observacao ?? '');
  }, [existente]);

  const categoriasDoTipo = useMemo(() => categorias?.filter((c) => c.tipo === tipo) ?? [], [categorias, tipo]);
  const categoria = categorias?.find((c) => c.id === categoriaId);
  const frequentes = useMemo(() => descricoesFrequentes(historico ?? [], 12), [historico]);
  const valorCentavos = lerValor(valorTexto);
  const podeParcelar = !editando && tipo === 'despesa' && forma === 'credito';

  function trocarTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    setCategoriaId(null);
    setSubcategoriaId(undefined);
    setSugerida(false);
    categoriaManual.current = false;
    if (t === 'receita') { setParcelas(1); if (forma === 'credito') setForma('pix'); }
  }

  function escolherCategoria(idCat: number) {
    categoriaManual.current = true;
    setSugerida(false);
    if (idCat !== categoriaId) setSubcategoriaId(undefined);
    setCategoriaId(idCat);
    setErros((e) => ({ ...e, categoriaId: undefined }));
  }

  function mudarDescricao(texto: string) {
    setDescricao(texto);
    if (categoriaManual.current || !historico) return;
    const s = sugestaoPorDescricao(texto, historico);
    if (s && s.tipo === tipo) {
      setCategoriaId(s.categoriaId);
      setSubcategoriaId(s.subcategoriaId);
      setForma(s.forma);
      setSugerida(true);
      setErros((e) => ({ ...e, categoriaId: undefined }));
    }
  }

  function mudarData(novaData: string) {
    setData(novaData);
    if (!pagoManual.current) setPago(novaData <= hoje);
  }

  function voltar() {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  }

  function montarDados(): DadosLancamento {
    return {
      tipo, data, descricao, valor: valorCentavos ?? 0, categoriaId, subcategoriaId, forma,
      observacao, fixa: fixa && !(podeParcelar && parcelas > 1), situacao: pago ? 'pago' : 'a_pagar', parcelas: podeParcelar ? parcelas : 1,
    };
  }

  async function salvar(e: FormEvent, lancarOutro = false) {
    e.preventDefault();
    if (salvando) return;
    const dados = montarDados();
    const encontrados = validarLancamento(dados);
    if (valorTexto.trim() && valorCentavos === null) encontrados.valor = 'Valor inválido. Exemplo: 72,50';
    setErros(encontrados);
    const primeiro = (['categoriaId', 'valor', 'descricao', 'data', 'parcelas', 'observacao'] as const).find((k) => encontrados[k]);
    if (primeiro) {
      document.getElementById(`campo-${primeiro}`)?.focus();
      return;
    }
    setSalvando(true);
    try {
      const nome = tipo === 'despesa' ? 'Despesa' : 'Receita';
      if (editando) {
        await atualizarLancamento(id!, dados);
        if (existente?.recorrenciaId && escopo === 'proximos') await alterarDaquiPraFrente(id!, dados);
        else if (!existente?.recorrenciaId && dados.fixa) await passarARepetir(id!);
        avisar(existente?.recorrenciaId && escopo === 'proximos' ? 'Alterações salvas neste e nos próximos meses.' : 'Alterações salvas.');
        voltar();
        return;
      }
      const repete = dados.fixa ? await criarComRepeticao(dados) : null;
      const ids = repete ? repete.ids : await criarLancamento(dados);
      const texto = dados.parcelas > 1
        ? `${nome} de ${formatarMoeda(dados.valor)} salva em ${dados.parcelas}x.`
        : `${nome} de ${formatarMoeda(dados.valor)} salva.`;
      // Orçamento: avisa se este gasto fez a categoria chegar a 80% ou passar do limite do mês
      let alerta: string | null = null;
      const cat = categorias?.find((c) => c.id === dados.categoriaId);
      if (tipo === 'despesa' && cat?.limiteMensal) {
        const novos = (await banco.lancamentos.bulkGet(ids)).filter((l) => l !== undefined);
        const mes = novos[0]?.data.slice(0, 7);
        const desteMes = novos.filter((l) => l.data.slice(0, 7) === mes).reduce((t, l) => t + l.valor, 0);
        const depois = mes ? await gastoDaCategoriaNoMes(cat.id!, novos[0].data) : 0;
        alerta = alertaOrcamento(cat.nome, cat.limiteMensal, depois - desteMes, depois);
      }
      avisar(`${texto}${repete ? ' Vai se repetir todo mês.' : ''}${alerta ? ` ${alerta}` : ''}`, {
        rotulo: 'Desfazer', executar: () => void (repete ? apagarRepeticao(repete.recId) : banco.lancamentos.bulkDelete(ids)),
      });
      if (lancarOutro) {
        setValorTexto(''); setDescricao(''); setObservacao(''); setCategoriaId(null); setSubcategoriaId(undefined);
        setParcelas(1); setFixa(false); setSugerida(false); setErros({});
        categoriaManual.current = false;
        topo.current?.focus();
        window.scrollTo({ top: 0 });
      } else {
        voltar();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(modo?: 'so-este' | 'parar') {
    if (!id) return;
    if (existente?.recorrenciaId) {
      if (!modo) { setPerguntaExcluir(true); return; }
      const desfazer = modo === 'parar'
        ? await pararDeRepetir(Number(existente.recorrenciaId), mesDe(existente.data))
        : await excluirSoEsteMes(id);
      // "Parar" apaga só o que está a pagar; se esta já estava paga, apaga ela também
      if (modo === 'parar' && existente.situacao === 'pago') await banco.lancamentos.delete(id);
      if (desfazer) avisar(modo === 'parar' ? 'Conta excluída e não vai mais se repetir.' : 'Conta deste mês excluída.', {
        rotulo: 'Desfazer', executar: () => void (async () => { await desfazer.executar(); if (modo === 'parar') await banco.lancamentos.put(existente); })(),
      });
      voltar();
      return;
    }
    const copia = await excluirLancamento(id);
    if (copia) avisar('Lançamento excluído.', { rotulo: 'Desfazer', executar: () => void restaurarLancamento(copia) });
    voltar();
  }

  if (editando && existente === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="m-0 text-2xl font-extrabold">Lançamento não encontrado</h1>
        <p className="m-0 text-suave">Ele pode ter sido excluído.</p>
        <button type="button" onClick={() => navigate('/lancamentos')} className="min-h-11 self-start rounded-xl bg-primaria px-4 font-bold text-white">Ver lançamentos</button>
      </div>
    );
  }
  if (!categorias || (editando && !existente)) return <p className="text-suave">Carregando…</p>;

  const valorParcela = podeParcelar && parcelas > 1 && valorCentavos ? dividirEmParcelas(valorCentavos, parcelas) : null;

  return (
    <form onSubmit={(e) => salvar(e)} noValidate className="mx-auto flex max-w-2xl flex-col gap-5 pb-28 md:pb-0">
      <div className="flex items-center gap-2">
        <button type="button" onClick={voltar} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1 ref={topo} tabIndex={-1} className="m-0 flex-1 text-xl font-extrabold md:text-2xl">{editando ? 'Editar lançamento' : 'Novo lançamento'}</h1>
      </div>

      {/* Tipo */}
      <div role="radiogroup" aria-label="Tipo de lançamento" className="flex rounded-2xl bg-borda p-1">
        {(['despesa', 'receita'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => trocarTipo(t)}
            className={`min-h-11 flex-1 rounded-xl text-[15px] font-extrabold ${tipo === t ? (t === 'despesa' ? 'bg-cartao text-perigo-texto shadow' : 'bg-cartao text-ok-texto shadow') : 'text-suave'}`}>
            {t === 'despesa' ? 'Gastei' : 'Recebi'}
          </button>
        ))}
      </div>

      {existente?.parcela && (
        <p className="m-0 flex items-start gap-2 rounded-2xl bg-primaria-clara p-3 text-sm text-[#2E2860]">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          Parcela {existente.parcela.numero} de {existente.parcela.total}. As alterações valem só para esta parcela.
        </p>
      )}

      {/* 1. Categoria */}
      <fieldset className="m-0 border-0 p-0" aria-describedby={erros.categoriaId ? 'erro-categoriaId' : undefined}>
        <legend className="mb-2 p-0 text-sm font-bold text-suave">1 · {tipo === 'despesa' ? 'Com o que gastou?' : 'De onde veio?'}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {categoriasDoTipo.map((c, i) => {
            const ativo = c.id === categoriaId;
            return (
              <button key={c.id} id={i === 0 ? 'campo-categoriaId' : undefined} type="button" aria-pressed={ativo} onClick={() => escolherCategoria(c.id!)}
                className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-xs leading-tight ${ativo ? 'border-2 border-primaria bg-primaria-clara font-extrabold text-primaria-escura' : 'border border-borda bg-cartao font-bold text-tinta'}`}>
                <IconeCategoria nome={c.icone} tamanho={22} />{c.nome}
              </button>
            );
          })}
        </div>
        {erros.categoriaId && <p id="erro-categoriaId" role="alert" className="m-0 mt-2 text-sm font-bold text-perigo-texto">{erros.categoriaId}</p>}
        {sugerida && categoria && (
          <p className="m-0 mt-2 flex items-center gap-1.5 text-sm font-semibold text-primaria-escura"><Sparkles size={16} aria-hidden="true" />Categoria sugerida pelo que você lançou antes. Toque em outra para trocar.</p>
        )}
        {categoria && categoria.subcategorias.length > 0 && (
          <div className="mt-3">
            <p className="m-0 mb-2 text-sm font-semibold text-suave" id="rotulo-sub">{categoria.nome} — detalhe (opcional)</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="rotulo-sub">
              {categoria.subcategorias.map((s) => (
                <button key={s.id} type="button" aria-pressed={s.id === subcategoriaId} onClick={() => setSubcategoriaId(s.id === subcategoriaId ? undefined : s.id)}
                  className={`min-h-11 rounded-full px-3.5 text-sm ${s.id === subcategoriaId ? 'bg-primaria font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold text-tinta'}`}>
                  {s.nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      {/* 2. Valor e detalhes */}
      <section aria-label="Valor e detalhes" className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
        <p className="m-0 text-sm font-bold text-suave">2 · Quanto e como</p>
        <div>
          <label htmlFor="campo-valor" className="text-sm font-bold">Valor</label>
          <div className={`mt-1 flex items-center gap-2 rounded-2xl border-2 px-3 ${erros.valor ? 'border-status-perigo' : 'border-borda-forte focus-within:border-primaria'}`}>
            <span className="text-2xl font-extrabold text-suave" aria-hidden="true">R$</span>
            <input id="campo-valor" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valorTexto}
              onChange={(e) => { setValorTexto(e.target.value.replace(/[^\d.,]/g, '')); setErros((x) => ({ ...x, valor: undefined })); }}
              onBlur={() => { if (valorCentavos !== null && valorCentavos > 0) setValorTexto(paraCampo(valorCentavos)); }}
              aria-invalid={!!erros.valor} aria-describedby={erros.valor ? 'erro-valor' : undefined}
              className="min-h-14 w-full min-w-0 border-0 bg-transparent text-3xl font-extrabold text-tinta outline-none" />
          </div>
          {erros.valor && <p id="erro-valor" role="alert" className="m-0 mt-1 text-sm font-bold text-perigo-texto">{erros.valor}</p>}
        </div>

        <div>
          <label htmlFor="campo-descricao" className="text-sm font-bold">Descrição <span className="font-semibold text-suave">(opcional)</span></label>
          <input id="campo-descricao" list="descricoes-frequentes" autoComplete="off" maxLength={LIMITES.descricao}
            placeholder={tipo === 'despesa' ? 'Ex.: Mercado, Padaria, Luz' : 'Ex.: Salário, Freela'} value={descricao}
            onChange={(e) => mudarDescricao(e.target.value)} aria-describedby={erros.descricao ? 'erro-descricao' : undefined}
            className="mt-1 min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta" />
          <datalist id="descricoes-frequentes">{frequentes.map((d) => <option key={d} value={d} />)}</datalist>
          {erros.descricao && <p id="erro-descricao" role="alert" className="m-0 mt-1 text-sm font-bold text-perigo-texto">{erros.descricao}</p>}
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="p-0 text-sm font-bold">{tipo === 'despesa' ? 'Como pagou?' : 'Como recebeu?'}</legend>
          <div className={`mt-1 grid gap-2 ${tipo === 'despesa' ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {(Object.keys(NOMES_FORMAS) as FormaPagamento[]).filter((f) => tipo === 'despesa' || f !== 'credito').map((f) => (
              <button key={f} type="button" aria-pressed={forma === f} onClick={() => { setForma(f); if (f !== 'credito') setParcelas(1); }}
                className={`min-h-11 rounded-xl text-[13px] ${forma === f ? 'bg-tinta font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold text-tinta'}`}>
                {NOMES_FORMAS[f]}
              </button>
            ))}
          </div>
        </fieldset>

        {podeParcelar && (
          <div>
            <label htmlFor="campo-parcelas" className="text-sm font-bold">Parcelas no cartão</label>
            <select id="campo-parcelas" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}
              className="mt-1 min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta">
              <option value={1}>À vista (1x)</option>
              {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
            </select>
            {valorParcela && (
              <p className="m-0 mt-1 text-sm text-suave">
                {parcelas}x de {formatarMoeda(valorParcela[1])}{valorParcela[0] !== valorParcela[1] ? ` (1ª de ${formatarMoeda(valorParcela[0])})` : ''} — uma parcela em cada mês, a partir de {formatarData(data)}.
              </p>
            )}
          </div>
        )}

        <div>
          <p className="m-0 text-sm font-bold" id="rotulo-data">Data</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" aria-pressed={data === hoje} onClick={() => mudarData(hoje)}
              className={`min-h-11 rounded-xl px-4 text-sm ${data === hoje ? 'bg-tinta font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold'}`}>Hoje</button>
            <button type="button" aria-pressed={data === adicionarDias(hoje, -1)} onClick={() => mudarData(adicionarDias(hoje, -1))}
              className={`min-h-11 rounded-xl px-4 text-sm ${data === adicionarDias(hoje, -1) ? 'bg-tinta font-extrabold text-white' : 'border border-borda-forte bg-cartao font-semibold'}`}>Ontem</button>
            <CampoData id="campo-data" rotulo="Data" valor={data} aoMudar={mudarData} className="flex-1" />
          </div>
          <p className="m-0 mt-1 text-sm text-suave first-letter:uppercase">{nomeDoDia(data)}{data > hoje ? ' — data futura' : ''}</p>
          {erros.data && <p role="alert" className="m-0 mt-1 text-sm font-bold text-perigo-texto">{erros.data}</p>}
        </div>

        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={pago} onChange={(e) => { pagoManual.current = true; setPago(e.target.checked); }} className="h-6 w-6 accent-primaria" />
          <span>{tipo === 'despesa' ? 'Já foi pago' : 'Já recebi'}<br /><span className="text-sm text-suave">{pago ? 'Conta como realizado.' : `Fica como "a ${tipo === 'despesa' ? 'pagar' : 'receber'}".`}</span></span>
        </label>

        {existente?.recorrenciaId ? (
          <fieldset className="m-0 rounded-2xl border border-borda bg-fundo p-3">
            <legend className="px-1 text-sm font-bold">Esta conta se repete todo mês. Salvar a mudança:</legend>
            {([['so-este', 'Só neste mês'], ['proximos', 'Neste e nos próximos meses']] as const).map(([v, t]) => (
              <label key={v} className="flex min-h-11 items-center gap-3 text-[15px]">
                <input type="radio" name="escopo" value={v} checked={escopo === v} onChange={() => setEscopo(v)} className="h-5 w-5 accent-primaria" />{t}
              </label>
            ))}
          </fieldset>
        ) : !(podeParcelar && parcelas > 1) && (
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" checked={fixa} onChange={(e) => setFixa(e.target.checked)} className="h-6 w-6 accent-primaria" />
            <span>Repete todo mês<br /><span className="text-sm text-suave">{tipo === 'despesa' ? 'Aluguel, luz, internet… Aparece sozinha em "Contas do mês".' : 'Salário, aposentadoria, pensão… Entra sozinha todo mês.'}</span></span>
          </label>
        )}

        <details open={!!observacao} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-primaria">+ Observação (opcional)</summary>
          <label htmlFor="campo-observacao" className="sr-only">Observação</label>
          <textarea id="campo-observacao" rows={3} maxLength={LIMITES.observacao} value={observacao} onChange={(e) => setObservacao(e.target.value)}
            className="mt-1 w-full rounded-xl border border-borda-forte bg-cartao p-3 text-base text-tinta" />
        </details>
      </section>

      {perguntaExcluir && (
        <div role="group" aria-label="Excluir conta que se repete" className="flex flex-col gap-2 rounded-2xl border-2 border-perigo-texto bg-cartao p-3">
          <p className="m-0 font-bold">Esta conta se repete todo mês. O que excluir?</p>
          <button type="button" onClick={() => void excluir('so-este')} className="min-h-12 rounded-xl border border-perigo-texto px-3 font-bold text-perigo-texto">Só a deste mês</button>
          <button type="button" onClick={() => void excluir('parar')} className="min-h-12 rounded-xl bg-perigo px-3 font-bold text-white">Esta e as próximas (parar de repetir)</button>
          <button type="button" onClick={() => setPerguntaExcluir(false)} className="min-h-11 rounded-xl px-3 font-bold">Cancelar</button>
        </div>
      )}
      {editando && !perguntaExcluir && (
        <button type="button" onClick={() => void excluir()} className="flex min-h-12 items-center justify-center gap-2 self-start rounded-xl border border-perigo-texto bg-cartao px-4 font-bold text-perigo-texto">
          <Trash2 size={18} aria-hidden="true" />Excluir lançamento
        </button>
      )}

      {/* Botões: fixos embaixo no celular */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-borda bg-fundo px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
        {!editando && (
          <button type="button" onClick={(e) => salvar(e as unknown as FormEvent, true)} disabled={salvando}
            className="min-h-14 flex-1 rounded-2xl border-2 border-primaria bg-cartao px-3 text-[15px] font-extrabold text-primaria-escura">Salvar e lançar outro</button>
        )}
        <button type="submit" disabled={salvando} className="min-h-14 flex-1 rounded-2xl bg-primaria px-3 text-[15px] font-extrabold text-white hover:bg-primaria-escura">
          {editando ? 'Salvar alterações' : valorCentavos ? `Salvar ${formatarMoeda(valorCentavos)}` : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
