import { ArrowLeft, Pencil, PartyPopper, QrCode as IconeQr, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CampoData } from '../componentes/ui/CampoData';
import { ArquivosEscolhidos, BotaoAnexar, ListaComprovantes } from '../componentes/ui/Comprovantes';
import { Pote } from '../componentes/ui/Pote';
import { useAvisos } from '../hooks/useAvisos';
import { useCofrinho } from '../hooks/useDados';
import { anexarComprovantes } from '../servicos/comprovantes';
import { depositar, desfazerMovimento, excluirCofrinho, ONDE_GUARDA, resumirCofrinho, sacar, textoPrevisao } from '../servicos/cofrinhos';
import { formatarData, hojeISO } from '../utils/datas';
import { formatarMoeda, formatarPercentual, lerValor } from '../utils/moeda';

// Página de um cofrinho: quanto tem, quanto falta, previsão, depósitos e saques.

export function CofrinhoDetalhe() {
  const id = Number(useParams().id);
  const dados = useCofrinho(id);
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const r = useMemo(() => (dados ? resumirCofrinho(dados.cofrinho, dados.movimentos) : null), [dados]);
  const [modo, setModo] = useState<'nenhum' | 'deposito' | 'saque'>('nenhum');
  const [valorTexto, setValorTexto] = useState('');
  const [data, setData] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [confirmarSaque, setConfirmarSaque] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);

  if (dados === null) return <div className="flex flex-col gap-2"><h1 className="m-0 text-2xl font-extrabold">Cofrinho não encontrado</h1><Link to="/cofrinhos" className="font-bold text-primaria">Voltar</Link></div>;
  if (!dados || !r) return <p className="text-suave">Carregando…</p>;
  const c = dados.cofrinho;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    const valor = lerValor(valorTexto);
    if (!valor || valor <= 0) { setErro('Informe um valor maior que zero.'); return; }
    if (modo === 'saque' && valor > r!.saldo) { setErro(`O cofrinho tem ${formatarMoeda(r!.saldo)}.`); return; }
    // Trava de reflexão: sacar antes de bater a meta pede confirmação
    if (modo === 'saque' && !r!.atingido && !confirmarSaque) { setConfirmarSaque(true); return; }
    const movId = modo === 'deposito' ? await depositar(c, valor, data, 'manual') : await sacar(c, valor, data);
    const recusados = arquivos.length ? await anexarComprovantes(movId, arquivos) : [];
    const novoSaldo = r!.saldo + (modo === 'deposito' ? valor : -valor);
    const texto = modo === 'deposito'
      ? (novoSaldo >= c.meta ? `Meta alcançada! Você juntou ${formatarMoeda(novoSaldo)} em “${c.nome}”.` : `${formatarMoeda(valor)} guardados. Faltam ${formatarMoeda(c.meta - novoSaldo)}.`)
      : `Saque de ${formatarMoeda(valor)} registrado.`;
    if (recusados.length) setErro(recusados.join(' '));
    avisar(texto, { rotulo: 'Desfazer', executar: () => void desfazerMovimento(movId) });
    setModo('nenhum'); setValorTexto(''); if (!recusados.length) setErro(''); setConfirmarSaque(false); setData(hojeISO()); setArquivos([]);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-start gap-2">
        <Link to="/cofrinhos" aria-label="Voltar para Cofrinhos" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-xl font-extrabold md:text-2xl">{c.nome}</h1>
          <p className="m-0 text-sm text-suave">{ONDE_GUARDA[c.ondeGuarda].nome}</p>
        </div>
        <Link to={`/cofrinhos/${id}/editar`} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte bg-cartao px-3 text-sm font-bold text-tinta no-underline"><Pencil size={16} aria-hidden="true" />Editar</Link>
      </div>

      {r.atingido && (
        <p className="m-0 flex items-center gap-2 rounded-2xl border border-[#BFE5C8] bg-[#E7F6EA] p-3 font-bold text-ok-texto" data-testid="meta-alcancada">
          <PartyPopper size={20} aria-hidden="true" />Meta alcançada! Você juntou {formatarMoeda(r.saldo)}. Quando quiser usar, é só sacar no app do banco e registrar aqui.
        </p>
      )}

      <section className="flex items-center gap-5 rounded-[22px] border border-borda bg-cartao p-5">
        <Pote percentual={r.percentual} tamanho={70} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm text-suave">Guardado</p>
          <p className="m-0 text-3xl font-extrabold" data-testid="saldo-cofrinho">{formatarMoeda(r.saldo)}</p>
          <p className="m-0 text-sm">de {formatarMoeda(c.meta)} · <strong>{formatarPercentual(r.percentual, 0)}</strong>{!r.atingido && <> · faltam {formatarMoeda(r.falta)}</>}</p>
          <p className="m-0 mt-2 text-sm font-bold text-primaria-escura" data-testid="previsao">{textoPrevisao(r)}</p>
          {r.precisaPorMes !== null && c.prazo && <p className="m-0 text-sm text-suave">Para chegar até {formatarData(c.prazo)}: guarde {formatarMoeda(r.precisaPorMes)} por mês.</p>}
          {r.rendimentoEstimadoMes > 0 && <p className="m-0 text-sm text-suave">Rendimento estimado: ~{formatarMoeda(r.rendimentoEstimadoMes)} por mês ({String(c.rendimentoMensal).replace('.', ',')}% ao mês, antes de impostos).</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link to={`/cofrinhos/${id}/guardar`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primaria px-4 font-extrabold text-white no-underline hover:bg-primaria-escura"><IconeQr size={18} aria-hidden="true" />Guardar agora (Pix)</Link>
        <button type="button" onClick={() => { setModo('deposito'); setConfirmarSaque(false); setErro(''); }} className="min-h-12 rounded-2xl border-2 border-primaria bg-cartao px-4 font-extrabold text-primaria-escura">Registrar depósito</button>
        <button type="button" onClick={() => { setModo('saque'); setConfirmarSaque(false); setErro(''); }} disabled={r.saldo <= 0} className="min-h-12 rounded-2xl border border-borda-forte bg-cartao px-4 font-bold text-tinta disabled:opacity-50">Registrar saque</button>
      </div>

      {modo !== 'nenhum' && (
        <form onSubmit={registrar} noValidate className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4">
          <h2 className="m-0 text-base font-extrabold">{modo === 'deposito' ? 'Registrar depósito' : 'Registrar saque'}</h2>
          <p className="m-0 text-sm text-suave">{modo === 'deposito' ? 'Use quando já transferiu pelo app do banco (ou depositou por boleto).' : 'Use quando já sacou o dinheiro no app do banco.'}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><label htmlFor="mov-valor" className="text-sm font-bold">Valor (R$)</label>
              <input id="mov-valor" inputMode="decimal" value={valorTexto} onChange={(e) => { setValorTexto(e.target.value.replace(/[^\d.,]/g, '')); setConfirmarSaque(false); }} className="min-h-12 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta" /></div>
            <div className="flex flex-col gap-1"><span className="text-sm font-bold">Data</span><CampoData id="mov-data" rotulo="Data" valor={data} aoMudar={setData} /></div>
          </div>
          {confirmarSaque && (
            <p className="m-0 rounded-xl border border-status-alerta bg-alerta-fundo p-3 text-sm font-bold text-alerta-texto" data-testid="trava-saque">
              Tem certeza? Faltam só {formatarMoeda(r.falta)} para a meta{r.previsao ? ` e você está a ${r.previsao.meses} ${r.previsao.meses === 1 ? 'mês' : 'meses'} do objetivo` : ''}. Toque em “Confirmar saque” se quiser mesmo sacar.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">Comprovante (opcional): print do Pix, foto do recibo ou PDF</span>
            <BotaoAnexar id="mov-comprovante" aoEscolher={(l) => setArquivos((x) => [...x, ...l])} />
            <ArquivosEscolhidos arquivos={arquivos} aoRemover={(i) => setArquivos((x) => x.filter((_, j) => j !== i))} />
          </div>
          {erro && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setModo('nenhum'); setConfirmarSaque(false); setArquivos([]); }} className="min-h-12 flex-1 rounded-xl border border-borda-forte font-bold text-tinta">Cancelar</button>
            <button type="submit" className="min-h-12 flex-1 rounded-xl bg-primaria font-extrabold text-white">{modo === 'deposito' ? 'Registrar depósito' : confirmarSaque ? 'Confirmar saque' : 'Registrar saque'}</button>
          </div>
        </form>
      )}

      <section className="flex flex-col gap-2 rounded-[22px] border border-borda bg-cartao p-4">
        <h2 className="m-0 text-base font-extrabold">Histórico</h2>
        {r.movimentos.length === 0 ? <p className="m-0 text-sm text-suave">Nenhum depósito ainda.</p> : (
          <ul className="m-0 flex list-none flex-col p-0" data-testid="historico-cofrinho">
            {r.movimentos.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 border-b border-borda py-2.5 text-sm last:border-b-0">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-suave">{formatarData(m.data)}</span>
                  <span className="flex-1">{m.tipo === 'deposito' ? `Depósito${m.via === 'pix' ? ' (Pix)' : ''}` : 'Saque'}</span>
                  <strong className={m.tipo === 'deposito' ? 'text-ok-texto' : 'text-perigo-texto'}>{m.tipo === 'deposito' ? '+' : '−'} {formatarMoeda(m.valor)}</strong>
                  <button type="button" aria-label={`Apagar ${m.tipo} de ${formatarData(m.data)}`} onClick={() => desfazerMovimento(m.id!).then(() => avisar('Registro apagado.'))} className="flex h-11 w-11 items-center justify-center rounded-xl text-suave hover:text-perigo-texto"><Trash2 size={16} aria-hidden="true" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-24">
                  <ListaComprovantes movimentoId={m.id!} ids={m.comprovantes ?? []} descricao={`${m.tipo === 'deposito' ? 'depósito' : 'saque'} de ${formatarData(m.data)}`} />
                  <BotaoAnexar id={`anexar-${m.id}`} texto={m.comprovantes?.length ? 'Anexar mais' : 'Anexar comprovante'}
                    aoEscolher={(l) => void anexarComprovantes(m.id!, l).then((r) => avisar(r.length ? r.join(' ') : l.length === 1 ? 'Comprovante guardado.' : `${l.length} comprovantes guardados.`))} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 text-xs text-suave">Os comprovantes ficam guardados só neste aparelho. O app não lê o saldo do banco: de vez em quando, confira o saldo real e ajuste aqui.</p>
      </section>

      {confirmarExclusao ? (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-status-perigo bg-cartao p-4">
          <p className="m-0 font-bold">Excluir o cofrinho “{c.nome}” e o histórico dele?</p>
          <p className="m-0 text-sm text-suave">O dinheiro continua no banco; os lançamentos “Guardei” continuam em Lançamentos.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmarExclusao(false)} className="min-h-11 flex-1 rounded-xl border border-borda-forte font-bold">Cancelar</button>
            <button type="button" onClick={() => excluirCofrinho(id).then(() => { avisar('Cofrinho excluído.'); navigate('/cofrinhos', { replace: true }); })} className="min-h-11 flex-1 rounded-xl bg-perigo font-bold text-white">Excluir</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmarExclusao(true)} className="flex min-h-11 items-center gap-2 self-start rounded-xl border border-perigo-texto bg-cartao px-4 font-bold text-perigo-texto"><Trash2 size={18} aria-hidden="true" />Excluir cofrinho</button>
      )}
    </div>
  );
}
