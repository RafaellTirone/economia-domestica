import { ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CampoPin } from '../componentes/ui/CampoPin';
import { CopiarCodigo } from '../componentes/ui/CopiarCodigo';
import { Pote } from '../componentes/ui/Pote';
import { QrCode } from '../componentes/ui/QrCode';
import { Selo } from '../componentes/ui/Selo';
import { useAvisos } from '../hooks/useAvisos';
import { useCofrinho } from '../hooks/useDados';
import { depositar, desfazerMovimento, resumirCofrinho, valorIncomum } from '../servicos/cofrinhos';
import { PinIncorreto } from '../servicos/cofre';
import { gerarBRCode, lerBRCode, mascararChave } from '../servicos/pix';
import { abrirChavePix, Bloqueado, tentativasRestantes, useRegistroPix, type DadosPix } from '../servicos/pixSeguro';
import { formatarData, hojeISO } from '../utils/datas';
import { formatarMoeda, formatarPercentual, lerValor } from '../utils/moeda';

// "Guardar agora": gera um Pix (no próprio aparelho) para a conta de reserva DA pessoa.
// Proteções: PIN, chave verificada, lacre conferido, código lido de volta antes de mostrar,
// confirmação de valor fora do comum, QR que some em 5 minutos e nunca é salvo,
// e o aviso de conferir o próprio nome no app do banco.

const VALIDADE_S = 5 * 60;

export function GuardarPix() {
  const id = Number(useParams().id);
  const dadosCofrinho = useCofrinho(id);
  const registro = useRegistroPix();
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const [valorTexto, setValorTexto] = useState('');
  const [pin, setPin] = useState('');
  const [confirmarValor, setConfirmarValor] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pix, setPix] = useState<{ codigo: string; dados: DadosPix; valor: number } | null>(null);
  const [restante, setRestante] = useState(VALIDADE_S);
  const [algoErrado, setAlgoErrado] = useState(false);

  // Contagem: o QR some sozinho em 5 minutos
  useEffect(() => {
    if (!pix) return;
    setRestante(VALIDADE_S);
    const t = window.setInterval(() => setRestante((s) => {
      if (s <= 1) { window.clearInterval(t); setPix(null); setErro('O código expirou por segurança. Gere outro se ainda for pagar.'); return 0; }
      return s - 1;
    }), 1000);
    return () => window.clearInterval(t);
  }, [pix]);

  if (dadosCofrinho === null) return <p className="text-suave">Cofrinho não encontrado.</p>;
  if (!dadosCofrinho || registro === undefined) return <p className="text-suave">Carregando…</p>;
  const c = dadosCofrinho.cofrinho;
  const r = resumirCofrinho(c, dadosCofrinho.movimentos);
  const valor = lerValor(valorTexto) ?? 0;
  const incomum = valorIncomum(valor, dadosCofrinho.movimentos.filter((m) => m.tipo === 'deposito').map((m) => m.valor));

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!(valor > 0)) return setErro('Informe quanto vai guardar.');
    if (incomum && !confirmarValor) return setErro(`Confira o valor: ${formatarMoeda(valor)} está bem acima do habitual. Marque a confirmação se estiver certo.`);
    if (pin.length !== 6) return setErro('Digite o seu PIN de 6 números.');
    setOcupado(true);
    try {
      const dados = await abrirChavePix(pin);
      if (!dados.verificada) return setErro('Sua chave ainda não passou no teste de R$ 0,01. Faça o teste antes de guardar.');
      const codigo = gerarBRCode({ chave: dados.chave, valor, titular: dados.titular, cidade: dados.cidade });
      // Confere o código gerado antes de mostrar: chave e valor têm que ser exatamente os pedidos
      const lido = lerBRCode(codigo);
      if (!lido || lido.chave !== dados.chave || lido.valor !== valor) return setErro('Falha de segurança ao gerar o código. Nada foi mostrado. Tente de novo.');
      setPix({ codigo, dados, valor });
      setPin('');
    } catch (x) {
      if (x instanceof Bloqueado) setErro(`Muitas tentativas erradas. Tente de novo às ${x.ate.toLocaleTimeString('pt-BR')}.`);
      else if (x instanceof PinIncorreto) {
        const restantes = registro ? tentativasRestantes(registro) - 1 : 0;
        setErro(`PIN incorreto${restantes > 0 ? ` (restam ${restantes} tentativas)` : ''}. Se você tem certeza do PIN, a chave pode ter sido alterada: apague e cadastre de novo.`);
      } else setErro('Não foi possível abrir a chave Pix.');
    } finally { setOcupado(false); }
  }

  async function jaPaguei() {
    if (!pix) return;
    const movId = await depositar(c, pix.valor, hojeISO(), 'pix');
    avisar(`${formatarMoeda(pix.valor)} guardados em “${c.nome}”.`, { rotulo: 'Desfazer', executar: () => void desfazerMovimento(movId) });
    setPix(null);
    navigate(`/cofrinhos/${id}`, { replace: true });
  }

  const depois = c.meta > 0 ? Math.min(100, ((r.saldo + valor) / c.meta) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link to={`/cofrinhos/${id}`} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></Link>
        <h1 className="m-0 flex-1 text-xl font-extrabold">Guardar em “{c.nome}”</h1>
        <span className="flex items-center gap-1 text-xs font-bold text-ok-texto"><Lock size={14} aria-hidden="true" />Protegido por PIN</span>
      </div>

      {!registro ? (
        <section className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4">
          <p className="m-0">Para gerar o Pix, cadastre primeiro a chave da sua conta de reserva (com o teste de R$ 0,01).</p>
          <Link to="/cofrinhos/pix" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primaria px-4 font-extrabold text-white no-underline">Cadastrar chave Pix</Link>
          <p className="m-0 text-sm text-suave">Prefere não usar Pix? Volte e use “Registrar depósito”. Boleto: gere um “boleto de depósito” no app do banco da reserva e registre aqui depois.</p>
        </section>
      ) : !pix ? (
        <form onSubmit={gerar} noValidate className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4">
          <div className="flex items-center gap-4">
            <Pote percentual={r.percentual} depois={depois} tamanho={52} />
            <div className="text-sm">
              <p className="m-0">Agora: <strong>{formatarMoeda(r.saldo)}</strong> ({formatarPercentual(r.percentual, 0)})</p>
              {valor > 0 && <p className="m-0 text-primaria-escura">Depois: <strong>{formatarMoeda(r.saldo + valor)}</strong> ({formatarPercentual(depois, 0)})</p>}
              <p className="m-0 text-suave">Meta: {formatarMoeda(c.meta)}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="guardar-valor" className="text-sm font-bold">Quanto vai guardar (R$)</label>
            <input id="guardar-valor" inputMode="decimal" value={valorTexto} onChange={(e) => { setValorTexto(e.target.value.replace(/[^\d.,]/g, '')); setConfirmarValor(false); }} placeholder="500,00" className="min-h-14 rounded-xl border-2 border-borda-forte bg-cartao px-3 text-2xl font-extrabold text-tinta" />
          </div>
          {incomum && (
            <label className="flex min-h-12 items-start gap-3 rounded-xl border border-status-alerta bg-alerta-fundo p-3 text-sm text-alerta-texto">
              <input id="guardar-confirmar-valor" type="checkbox" checked={confirmarValor} onChange={(e) => setConfirmarValor(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-primaria" />
              <span><strong>Valor acima do habitual: {formatarMoeda(valor)}.</strong> Confirmo que é este valor mesmo.</span>
            </label>
          )}
          <CampoPin id="guardar-pin" rotulo="Seu PIN" valor={pin} aoMudar={setPin} />
          {erro && <p role="alert" className="m-0 rounded-xl bg-perigo-fundo p-3 text-sm font-bold text-perigo-texto">{erro}</p>}
          <button type="submit" disabled={ocupado} className="min-h-12 rounded-2xl bg-primaria px-4 font-extrabold text-white disabled:opacity-50">{ocupado ? 'Abrindo a chave…' : 'Gerar Pix'}</button>
        </form>
      ) : (
        <section className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4" data-testid="pix-gerado">
          <div className="flex flex-col items-center gap-2">
            <p className="m-0 text-3xl font-extrabold">{formatarMoeda(pix.valor)}</p>
            <QrCode texto={pix.codigo} rotulo={`QR Code Pix de ${formatarMoeda(pix.valor)} para a sua conta de reserva`} />
            <p className="m-0 text-xs text-suave" aria-live="off">O código some em <strong className="text-tinta">{Math.floor(restante / 60)}:{String(restante % 60).padStart(2, '0')}</strong> e nunca fica salvo.</p>
            <CopiarCodigo codigo={pix.codigo} />
          </div>
          <div className="flex flex-col gap-1.5 rounded-2xl bg-fundo p-3 text-sm" data-testid="destino-pix">
            <p className="m-0 text-xs text-suave">Este Pix envia {formatarMoeda(pix.valor)} para</p>
            <p className="m-0"><strong>{pix.dados.titular} (você)</strong> · {pix.dados.banco}</p>
            <p className="m-0">Chave {mascararChave(pix.dados.tipo, pix.dados.chave)} · <strong className="text-ok-texto">verificada{pix.dados.verificadaEm ? ` em ${formatarData(pix.dados.verificadaEm.slice(0, 10))}` : ''}</strong></p>
            <p className="m-0 flex items-center gap-2">Selo de segurança: <Selo chave={pix.dados.chave} /></p>
            <p className="m-0 text-xs text-suave">É sempre o mesmo selo. Se um dia aparecer outro, não pague.</p>
          </div>
          <p className="m-0 flex items-start gap-2 rounded-2xl border border-status-alerta bg-alerta-fundo p-3 text-sm text-alerta-texto" data-testid="aviso-nome">
            <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>No app do seu banco, <strong>confira se aparece o SEU nome</strong> como destinatário antes de confirmar. Se aparecer outro nome, não pague.</span>
          </p>
          <button type="button" onClick={jaPaguei} className="min-h-14 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white hover:bg-primaria-escura">Já paguei — registrar {formatarMoeda(pix.valor)}</button>
          <button type="button" onClick={() => { setAlgoErrado(true); setPix(null); }} className="min-h-12 rounded-2xl border-2 border-perigo-texto bg-cartao font-extrabold text-perigo-texto">Algo está errado</button>
        </section>
      )}
      {algoErrado && !pix && (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-status-perigo bg-cartao p-3 text-sm" data-testid="algo-errado">
          <p className="m-0 font-bold text-perigo-texto">Não pague. O código foi descartado.</p>
          <p className="m-0">Se apareceu outro nome ou outro valor no banco, apague a chave Pix em Cofrinhos (“Esqueci o PIN”) e cadastre de novo, com o teste de R$ 0,01.</p>
        </div>
      )}
    </div>
  );
}
