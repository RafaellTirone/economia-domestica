import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CaixaMensagem } from '../componentes/ui/CaixaMensagem';
import { CampoData } from '../componentes/ui/CampoData';
import { ListaConferencia } from '../componentes/ui/ListaConferencia';
import { useAvisos } from '../hooks/useAvisos';
import { useEmprestimo } from '../hooks/useDados';
import { conferirContrato } from '../servicos/conferenciaContrato';
import { desfazerPagamento, excluirEmprestimo, registrarPagamento, resumirEmprestimo } from '../servicos/emprestimos';
import { converterTaxa, encargosDeAtraso, formatarTaxa, NOME_PERIODO } from '../servicos/juros';
import { diferencaEmDias, formatarData, hojeISO } from '../utils/datas';
import { formatarMoeda, formatarPercentual, lerValor } from '../utils/moeda';

// Página de um contrato: situação, juros que está pagando, custo do atraso conforme o contrato,
// quitação antecipada, tabela de parcelas e registro de pagamentos.

const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function EmprestimoDetalhe() {
  const { id: idTexto } = useParams();
  const id = Number(idTexto);
  const dados = useEmprestimo(id);
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const hoje = hojeISO();
  const r = useMemo(() => (dados ? resumirEmprestimo(dados.emprestimo, dados.pagamentos, hoje) : null), [dados, hoje]);

  // Registro de pagamento
  const [parcelaEscolhida, setParcelaEscolhida] = useState<number | null>(null);
  const [valorTexto, setValorTexto] = useState('');
  const [dataPag, setDataPag] = useState(hoje);
  const [erroPag, setErroPag] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [urlContrato, setUrlContrato] = useState<string | null>(null);

  const naoPagas = r?.parcelas.filter((p) => p.status !== 'paga') ?? [];
  const parcelaAtual = naoPagas.find((p) => p.numero === parcelaEscolhida) ?? r?.atrasadas[0] ?? r?.proxima ?? null;
  const encargosNaData = parcelaAtual && dados
    ? encargosDeAtraso(parcelaAtual.valor, dataPag > parcelaAtual.vencimentoUtil ? diferencaEmDias(parcelaAtual.vencimento, dataPag) : 0,
      dados.emprestimo.multaAtraso, dados.emprestimo.jurosMora, dados.emprestimo.periodoMora)
    : null;

  // Valor sugerido = parcela + encargos na data do pagamento
  useEffect(() => { if (encargosNaData) setValorTexto(paraCampo(encargosNaData.total)); }, [parcelaAtual?.numero, encargosNaData?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Link para abrir o PDF guardado no aparelho
  useEffect(() => {
    if (!dados?.arquivo) { setUrlContrato(null); return; }
    const url = URL.createObjectURL(dados.arquivo.dados);
    setUrlContrato(url);
    return () => URL.revokeObjectURL(url);
  }, [dados?.arquivo]);

  if (dados === null) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-2xl font-extrabold">Empréstimo não encontrado</h1>
        <Link to="/dividas" className="font-bold text-primaria">Voltar para Dívidas</Link>
      </div>
    );
  }
  if (!dados || !r) return <p className="text-suave">Carregando…</p>;
  const e = dados.emprestimo;

  async function pagar(ev: FormEvent) {
    ev.preventDefault();
    const valor = lerValor(valorTexto);
    if (!parcelaAtual) return;
    if (!valor || valor <= 0) { setErroPag('Informe o valor pago.'); document.getElementById('campo-valor-pago')?.focus(); return; }
    setErroPag('');
    const pagamentoId = await registrarPagamento(e, parcelaAtual.numero, valor, dataPag);
    const quitado = r!.pagas + 1 === e.numeroParcelas;
    const emDia = dataPag <= parcelaAtual.vencimentoUtil;
    const pct = formatarPercentual(((r!.pagas + 1) / e.numeroParcelas) * 100, 0);
    const texto = quitado ? `Contrato quitado! Parabéns, você está livre de “${e.nome}”.`
      : emDia ? `Parcela ${parcelaAtual.numero} paga em dia. Parabéns! Você já quitou ${pct}.`
        : `Parcela ${parcelaAtual.numero} registrada. Você já quitou ${pct}.`;
    avisar(texto, { rotulo: 'Desfazer', executar: () => void desfazerPagamento(pagamentoId) });
    setParcelaEscolhida(null);
    setDataPag(hoje);
  }

  async function excluir() {
    await excluirEmprestimo(id);
    avisar(`“${e.nome}” excluído.`);
    navigate('/dividas', { replace: true });
  }

  const taxaMes = r.taxaMensal;
  const jurosPctAMais = e.valorEmprestado ? (r.jurosTotalContrato / e.valorEmprestado) * 100 : 0;
  const conforme = e.termosConferidos ? 'conforme o contrato' : 'conforme os dados informados';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start gap-2">
        <Link to="/dividas" aria-label="Voltar para Dívidas" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-xl font-extrabold md:text-2xl">{e.nome}</h1>
          <p className="m-0 text-sm text-suave">{[e.instituicao, e.numeroContrato && `Contrato nº ${e.numeroContrato}`].filter(Boolean).join(' · ') || 'Sem número de contrato'}</p>
        </div>
        <Link to={`/dividas/${id}/editar`} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte bg-cartao px-3 text-sm font-bold text-tinta no-underline"><Pencil size={16} aria-hidden="true" />Editar</Link>
      </div>

      <CaixaMensagem mensagem={r.mensagem} />

      <dl className="m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Dado rotulo="Parcelas pagas" valor={`${r.pagas} de ${e.numeroParcelas}`} />
        <Dado rotulo="Faltam" valor={`${r.faltam} ${r.faltam === 1 ? 'parcela' : 'parcelas'}`} />
        <Dado rotulo="Quitado" valor={formatarPercentual(r.percentualQuitado, 0)} />
        <Dado rotulo="Para quitar hoje" valor={formatarMoeda(r.saldoDevedor)} destaque />
      </dl>

      {/* Atraso */}
      {r.atrasadas.map((p) => {
        const daqui15 = encargosDeAtraso(p.valor, p.encargos!.diasAtraso + 15, e.multaAtraso, e.jurosMora, e.periodoMora);
        const daqui30 = encargosDeAtraso(p.valor, p.encargos!.diasAtraso + 30, e.multaAtraso, e.jurosMora, e.periodoMora);
        return (
          <Bloco key={p.numero} titulo={`Parcela ${p.numero} atrasada — ${p.encargos!.diasAtraso} ${p.encargos!.diasAtraso === 1 ? 'dia' : 'dias'}`} alerta>
            <p className="m-0 text-sm text-suave">Venceu em {formatarData(p.vencimento)}. Valores {conforme}.</p>
            <table className="w-full border-collapse text-sm" data-testid={`atraso-${p.numero}`}>
              <tbody>
                <tr><td className="py-1">Parcela</td><td className="text-right">{formatarMoeda(p.valor)}</td></tr>
                <tr><td className="py-1">+ Multa ({formatarTaxa(e.multaAtraso, 2)}, cobrada uma vez)</td><td className="text-right">{formatarMoeda(p.encargos!.multa)}</td></tr>
                <tr><td className="py-1">+ Juros de mora ({formatarTaxa(e.jurosMora, 2)} {NOME_PERIODO[e.periodoMora]}, por dia de atraso)</td><td className="text-right">{formatarMoeda(p.encargos!.mora)}</td></tr>
                <tr className="border-t border-borda font-extrabold"><td className="pt-2">Para pagar hoje</td><td className="pt-2 text-right text-perigo-texto">{formatarMoeda(p.encargos!.total)}</td></tr>
              </tbody>
            </table>
            <p className="m-0 rounded-xl bg-fundo p-3 text-sm">Se continuar atrasando: daqui a 15 dias <strong>{formatarMoeda(daqui15.total)}</strong> · daqui a 30 dias <strong>{formatarMoeda(daqui30.total)}</strong>. Cada dia custa cerca de {formatarMoeda(p.encargos!.moraPorDia)}.</p>
          </Bloco>
        );
      })}

      {/* Registrar pagamento */}
      {r.status !== 'quitado' && parcelaAtual && (
        <Bloco titulo="Registrar pagamento">
          <form onSubmit={pagar} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="campo-parcela" className="text-sm font-bold">Parcela</label>
                <select id="campo-parcela" value={parcelaAtual.numero} onChange={(ev) => setParcelaEscolhida(Number(ev.target.value))} className="min-h-12 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta">
                  {naoPagas.slice(0, 24).map((p) => <option key={p.numero} value={p.numero}>{p.numero} de {e.numeroParcelas} — vence {formatarData(p.vencimento)}{p.status === 'atrasada' ? ' (atrasada)' : ''}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold" id="rotulo-data-pag">Data do pagamento</span>
                <CampoData id="campo-data-pagamento" rotulo="Data do pagamento" valor={dataPag} aoMudar={setDataPag} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="campo-valor-pago" className="text-sm font-bold">Valor pago (R$)</label>
                <input id="campo-valor-pago" inputMode="decimal" value={valorTexto} onChange={(ev) => setValorTexto(ev.target.value.replace(/[^\d.,]/g, ''))} className="min-h-12 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta" />
              </div>
            </div>
            {encargosNaData && encargosNaData.diasAtraso > 0 && (
              <p className="m-0 text-sm text-perigo-texto">Com {encargosNaData.diasAtraso} dias de atraso: {formatarMoeda(parcelaAtual.valor)} + multa {formatarMoeda(encargosNaData.multa)} + juros {formatarMoeda(encargosNaData.mora)}.</p>
            )}
            {erroPag && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erroPag}</p>}
            <button type="submit" className="min-h-12 rounded-xl bg-primaria px-4 font-extrabold text-white hover:bg-primaria-escura">Registrar pagamento da parcela {parcelaAtual.numero}</button>
            <p className="m-0 text-xs text-suave">O pagamento também entra como despesa em Lançamentos (categoria Dívidas).</p>
          </form>
        </Bloco>
      )}

      {/* Juros */}
      <Bloco titulo="Quanto você paga de juros">
        <table className="w-full border-collapse text-sm" data-testid="tabela-juros">
          <tbody>
            <tr><td className="py-1.5">Valor emprestado</td><td className="text-right font-bold">{formatarMoeda(e.valorEmprestado)}</td></tr>
            <tr><td className="py-1.5">Parcela sem juros → com juros</td><td className="text-right font-bold">{formatarMoeda(r.parcelaSemJuros)} → {formatarMoeda(e.valorParcela)}</td></tr>
            <tr><td className="py-1.5">Juros em cada parcela (média)</td><td className="text-right font-bold">{formatarMoeda(r.jurosPorParcelaMedio)}</td></tr>
            <tr><td className="py-1.5">Juros no contrato todo</td><td className="text-right font-bold">{formatarMoeda(r.jurosTotalContrato)} <span className="font-normal text-suave">({formatarPercentual(jurosPctAMais)} a mais)</span></td></tr>
            {taxaMes !== null && (
              <tr><td className="py-1.5">Taxa de juros {r.fonteTaxa === 'contrato' ? '(do contrato)' : '(calculada pelas parcelas)'}</td>
                <td className="text-right font-bold">{formatarTaxa(taxaMes)} ao mês<br /><span className="font-normal text-suave">{formatarTaxa(converterTaxa(taxaMes, 'mes', 'dia'), 3)} ao dia · {formatarTaxa(converterTaxa(taxaMes, 'mes', 'ano'))} ao ano</span></td></tr>
            )}
            {e.cetAnual !== null && <tr><td className="py-1.5">CET (custo efetivo total)</td><td className="text-right font-bold">{formatarTaxa(e.cetAnual)} ao ano</td></tr>}
          </tbody>
        </table>
        {r.taxaDiverge && r.taxaImplicitaMensal !== null && (
          <p className="m-0 rounded-xl bg-alerta-fundo p-3 text-sm text-alerta-texto">As parcelas embutem {formatarTaxa(r.taxaImplicitaMensal)} ao mês, mais do que a taxa do contrato. A diferença costuma ser seguro ou tarifas incluídos na parcela.</p>
        )}
      </Bloco>

      {/* Quitação */}
      {r.status !== 'quitado' && (
        <Bloco titulo="Se quitar hoje">
          <p className="m-0 text-sm">Para quitar hoje: <strong>{formatarMoeda(r.saldoDevedor)}</strong>. Pagando as {r.faltam} parcelas que faltam, você pagaria {formatarMoeda(r.saldoDevedor + r.economiaQuitandoHoje)}.</p>
          <p className="m-0 rounded-xl bg-[#E7F6EA] p-3 text-sm font-bold text-ok-texto">Quitando hoje, você deixa de pagar cerca de {formatarMoeda(r.economiaQuitandoHoje)} de juros.</p>
          <p className="m-0 text-xs text-suave">Estimativa. Por lei, na quitação antecipada os juros futuros são descontados; peça o valor exato à instituição.</p>
        </Bloco>
      )}

      {/* Contrato */}
      <Bloco titulo="Contrato">
        {dados.arquivo && urlContrato ? (
          <div className="flex flex-wrap items-center gap-3">
            <FileText size={22} aria-hidden="true" className="text-primaria" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{dados.arquivo.nome}</span>
            <a href={urlContrato} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-primaria px-3 text-sm font-bold text-primaria-escura no-underline">Abrir contrato</a>
          </div>
        ) : (
          <p className="m-0 text-sm text-suave">Nenhum contrato anexado. <Link to={`/dividas/${id}/editar`} className="inline-flex min-h-11 items-center font-bold text-primaria">Anexar o PDF</Link></p>
        )}
        <p className="m-0 text-sm" data-testid="situacao-conferencia">{e.termosConferidos ? (e.conferenciaAutomatica ? 'Conferido automaticamente pela análise do app.' : 'Termos conferidos por você com o contrato.') : 'Termos ainda não conferidos com um contrato.'} Multa {formatarTaxa(e.multaAtraso)} · juros de mora {formatarTaxa(e.jurosMora)} {NOME_PERIODO[e.periodoMora]}.</p>
        {Object.keys(e.trechos ?? {}).length > 0 && <ListaConferencia conferencia={conferirContrato({ ...e, lidos: Object.keys(e.trechos) })} />}
        {Object.keys(e.trechos ?? {}).length > 0 && (
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-primaria">Ver de onde vieram os termos</summary>
            <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
              {Object.entries(e.trechos).map(([campo, t]) => <li key={campo} className="rounded-xl bg-fundo p-2 text-suave"><strong className="text-tinta">{ROTULOS[campo] ?? campo}:</strong> “{t}”</li>)}
            </ul>
          </details>
        )}
      </Bloco>

      {/* Tabela de parcelas */}
      <Bloco titulo="Parcelas">
        <div className="max-h-[480px] overflow-auto rounded-xl border border-borda">
          <table className="w-full min-w-[560px] border-collapse text-sm" data-testid="tabela-parcelas">
            <thead className="sticky top-0 bg-fundo text-left text-xs text-suave">
              <tr><th className="p-2">Nº</th><th className="p-2">Vencimento</th><th className="p-2 text-right">Parcela</th><th className="p-2 text-right">Juros</th><th className="p-2 text-right">Abate a dívida</th><th className="p-2">Situação</th></tr>
            </thead>
            <tbody>
              {r.parcelas.map((p) => (
                <tr key={p.numero} className="border-t border-borda" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <td className="p-2">{p.numero}</td>
                  <td className="p-2">{formatarData(p.vencimento)}</td>
                  <td className="p-2 text-right">{formatarMoeda(p.valor)}</td>
                  <td className="p-2 text-right">{p.juros === null ? '—' : formatarMoeda(p.juros)}</td>
                  <td className="p-2 text-right">{p.amortizacao === null ? '—' : formatarMoeda(p.amortizacao)}</td>
                  <td className={`p-2 font-bold ${p.status === 'atrasada' ? 'text-perigo-texto' : p.status === 'paga' ? 'text-ok-texto' : p.status === 'vence-hoje' ? 'text-alerta-texto' : 'text-suave'}`}>
                    {p.status === 'paga' ? `Paga ${formatarData(p.pagamento!.dataPagamento)}` : p.status === 'atrasada' ? `Atrasada ${p.encargos!.diasAtraso}d` : p.status === 'vence-hoje' ? 'Vence agora' : 'A vencer'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      {/* Excluir */}
      {confirmarExclusao ? (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-status-perigo bg-cartao p-4">
          <p className="m-0 font-bold">Excluir “{e.nome}”, os registros de pagamento e o contrato guardado?</p>
          <p className="m-0 text-sm text-suave">As despesas já lançadas em Lançamentos continuam lá.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmarExclusao(false)} className="min-h-11 flex-1 rounded-xl border border-borda-forte bg-cartao font-bold text-tinta">Cancelar</button>
            <button type="button" onClick={excluir} className="min-h-11 flex-1 rounded-xl bg-perigo font-bold text-white">Excluir</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmarExclusao(true)} className="flex min-h-11 items-center gap-2 self-start rounded-xl border border-perigo-texto bg-cartao px-4 font-bold text-perigo-texto">
          <Trash2 size={18} aria-hidden="true" />Excluir empréstimo
        </button>
      )}
    </div>
  );
}

const ROTULOS: Record<string, string> = {
  numeroContrato: 'Número do contrato', instituicao: 'Instituição', valorEmprestado: 'Valor emprestado', numeroParcelas: 'Nº de parcelas',
  valorParcela: 'Valor da parcela', taxaJuros: 'Taxa de juros', cetAnual: 'CET', multaAtraso: 'Multa', jurosMora: 'Juros de mora',
  dataPrimeiraParcela: '1ª parcela', dataContratacao: 'Data da contratação', tipo: 'Tipo', sistema: 'Sistema de parcelas',
};

function Dado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${destaque ? 'bg-tinta text-white' : 'border border-borda bg-cartao'}`}>
      <dt className={`text-xs font-semibold ${destaque ? 'text-menu-texto' : 'text-suave'}`}>{rotulo}</dt>
      <dd className="m-0 text-lg font-extrabold">{valor}</dd>
    </div>
  );
}

function Bloco({ titulo, alerta, children }: { titulo: string; alerta?: boolean; children: ReactNode }) {
  return (
    <section aria-label={titulo} className={`flex flex-col gap-3 rounded-[22px] bg-cartao p-4 md:p-5 ${alerta ? 'border-2 border-status-perigo' : 'border border-borda'}`}>
      <h2 className={`m-0 text-base font-extrabold ${alerta ? 'text-perigo-texto' : ''}`}>{titulo}</h2>
      {children}
    </section>
  );
}
