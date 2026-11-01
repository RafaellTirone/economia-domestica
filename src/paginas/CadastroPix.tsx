import { ArrowLeft, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoPin } from '../componentes/ui/CampoPin';
import { CopiarCodigo } from '../componentes/ui/CopiarCodigo';
import { QrCode } from '../componentes/ui/QrCode';
import { Selo } from '../componentes/ui/Selo';
import { useAvisos } from '../hooks/useAvisos';
import { validarPin } from '../servicos/cofre';
import { gerarBRCode, lerBRCode, mascararChave, NOMES_TIPO_CHAVE, validarChave, type TipoChave } from '../servicos/pix';
import { abrirChavePix, Bloqueado, salvarChavePix, useRegistroPix, type DadosPix } from '../servicos/pixSeguro';

// Cadastro (ou troca) da chave Pix da conta de reserva, em 4 passos:
// 1) aviso obrigatório, 2) chave digitada duas vezes + titular, 3) PIN, 4) teste de R$ 0,01.
// A chave só fica "verificada" depois que a pessoa confirma que o teste caiu na conta DELA.

type Passo = 'aviso' | 'pin-atual' | 'dados' | 'pin' | 'teste' | 'outro-nome';

export function CadastroPix() {
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const registro = useRegistroPix();
  const trocando = !!registro;
  const [passo, setPasso] = useState<Passo>('aviso');
  const [li, setLi] = useState(false);
  const [tipo, setTipo] = useState<TipoChave>('cpf');
  const [chave1, setChave1] = useState('');
  const [chave2, setChave2] = useState('');
  const [titular, setTitular] = useState('');
  const [bancoNome, setBancoNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinAtual, setPinAtual] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [dados, setDados] = useState<DadosPix | null>(null);

  function irPara(p: Passo) { setErro(''); setPasso(p); window.scrollTo({ top: 0 }); }

  async function conferirPinAtual(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try { await abrirChavePix(pinAtual); irPara('dados'); }
    catch (x) { setErro(x instanceof Bloqueado ? `Muitas tentativas erradas. Tente de novo às ${x.ate.toLocaleTimeString('pt-BR')}.` : 'PIN incorreto.'); }
    finally { setOcupado(false); }
  }

  function conferirDados(e: FormEvent) {
    e.preventDefault();
    const r = validarChave(tipo, chave1);
    if ('erro' in r) return setErro(r.erro);
    const r2 = validarChave(tipo, chave2);
    if ('erro' in r2 || r2.chave !== r.chave) return setErro('As duas chaves digitadas não são iguais. Digite de novo com calma.');
    if (titular.trim().length < 3) return setErro('Informe o seu nome, como aparece no banco.');
    if (!bancoNome.trim()) return setErro('Informe o banco da conta de reserva.');
    setDados({ tipo, chave: r.chave, titular: titular.trim(), banco: bancoNome.trim(), cidade: cidade.trim() || 'Brasil', verificada: false, verificadaEm: null });
    irPara(trocando ? 'teste' : 'pin');
  }

  function conferirPin(e: FormEvent) {
    e.preventDefault();
    const problema = validarPin(pin1);
    if (problema) return setErro(problema);
    if (pin1 !== pin2) return setErro('Os dois PINs não são iguais.');
    irPara('teste');
  }

  async function salvar(verificada: boolean) {
    if (!dados) return;
    setOcupado(true);
    try {
      const pin = trocando ? pinAtual : pin1;
      const agora = new Date().toISOString();
      await salvarChavePix(pin, { ...dados, verificada, verificadaEm: verificada ? agora : null },
        verificada ? `${trocando ? 'Chave trocada' : 'Chave cadastrada'} e verificada com teste de R$ 0,01` : `${trocando ? 'Chave trocada' : 'Chave cadastrada'} sem teste (ainda não verificada)`);
      avisar(verificada ? 'Chave Pix verificada e guardada com segurança.' : 'Chave guardada. Faça o teste de R$ 0,01 para liberar o "Guardar agora".');
      navigate('/cofrinhos', { replace: true });
    } finally { setOcupado(false); }
  }

  const codigoTeste = dados ? gerarBRCode({ chave: dados.chave, valor: 1, titular: dados.titular, cidade: dados.cidade }) : '';
  const testeConfere = dados ? lerBRCode(codigoTeste)?.chave === dados.chave : false;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/cofrinhos')} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></button>
        <h1 className="m-0 flex-1 text-xl font-extrabold md:text-2xl">{trocando ? 'Trocar chave Pix' : 'Cadastrar chave Pix'}</h1>
        <Lock size={18} aria-label="Área protegida" className="text-ok-texto" />
      </div>
      <ol aria-label="Etapas" className="m-0 flex list-none gap-1.5 p-0 text-xs font-bold">
        {(trocando ? [['aviso', 'Aviso'], ['pin-atual', 'PIN atual'], ['dados', 'Chave'], ['teste', 'Teste R$ 0,01']] : [['aviso', 'Aviso'], ['dados', 'Chave'], ['pin', 'PIN'], ['teste', 'Teste R$ 0,01']]).map(([id, t], i, lista) => {
          const atual = lista.findIndex(([x]) => x === (passo === 'outro-nome' ? 'teste' : passo));
          return <li key={id} aria-current={i === atual ? 'step' : undefined} className="flex flex-1 flex-col gap-1"><span className={`h-1.5 rounded-full ${i <= atual ? 'bg-primaria' : 'bg-borda'}`} />{t}</li>;
        })}
      </ol>

      {passo === 'aviso' && (
        <Cartao>
          <h2 className="m-0 flex items-center gap-2 text-lg font-extrabold"><ShieldCheck size={22} aria-hidden="true" className="text-primaria" />Antes de cadastrar sua chave Pix</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]" data-testid="aviso-pix">
            <li><strong>⚠️ Confira se a chave é da SUA conta de reserva.</strong> Um Pix enviado para a chave errada dificilmente é devolvido.</li>
            <li><strong>🧪 Na primeira vez, faça um teste com R$ 0,01.</strong> O app vai te guiar nesse teste.</li>
            <li><strong>ℹ️ O app NÃO lê o saldo do seu banco.</strong> Isso exigiria o Open Finance, que precisa de servidor e autorização do Banco Central. Por isso, cada depósito é confirmado por você, com um toque. De vez em quando, confira o saldo real no banco e ajuste aqui.</li>
            <li><strong>🛡️ O app nunca pede senha do banco, dados do cartão ou códigos de segurança. Nunca.</strong></li>
          </ul>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-borda p-3 font-bold">
            <input id="pix-li" type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} className="h-6 w-6 accent-primaria" />Li e entendi
          </label>
          <BotaoPrincipal desabilitado={!li} aoClicar={() => irPara(trocando ? 'pin-atual' : 'dados')}>Continuar</BotaoPrincipal>
        </Cartao>
      )}

      {passo === 'pin-atual' && (
        <form onSubmit={conferirPinAtual} noValidate><Cartao>
          <h2 className="m-0 text-lg font-extrabold">Digite o PIN atual</h2>
          <p className="m-0 text-sm text-suave">Para trocar a chave, confirme que é você.</p>
          <CampoPin id="pix-pin-atual" rotulo="PIN atual" valor={pinAtual} aoMudar={setPinAtual} />
          {erro && <Erro>{erro}</Erro>}
          <BotaoPrincipal tipo="submit" desabilitado={ocupado || pinAtual.length !== 6}>{ocupado ? 'Conferindo…' : 'Continuar'}</BotaoPrincipal>
        </Cartao></form>
      )}

      {passo === 'dados' && (
        <form onSubmit={conferirDados} noValidate><Cartao>
          <h2 className="m-0 text-lg font-extrabold">Chave da sua conta de reserva</h2>
          <Rotulo id="pix-tipo" texto="Tipo de chave">
            <select id="pix-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoChave)} className={ENTRADA}>
              {(Object.keys(NOMES_TIPO_CHAVE) as TipoChave[]).map((t) => <option key={t} value={t}>{NOMES_TIPO_CHAVE[t]}</option>)}
            </select>
          </Rotulo>
          <Rotulo id="pix-chave1" texto="Chave Pix">
            <input id="pix-chave1" value={chave1} onChange={(e) => setChave1(e.target.value)} autoComplete="off" className={ENTRADA} inputMode={tipo === 'email' || tipo === 'aleatoria' ? 'text' : 'numeric'} />
          </Rotulo>
          <Rotulo id="pix-chave2" texto="Digite a chave de novo">
            <input id="pix-chave2" value={chave2} onChange={(e) => setChave2(e.target.value)} autoComplete="off" onPaste={(e) => e.preventDefault()} className={ENTRADA} inputMode={tipo === 'email' || tipo === 'aleatoria' ? 'text' : 'numeric'} />
          </Rotulo>
          <Rotulo id="pix-titular" texto="Seu nome (como aparece no banco)">
            <input id="pix-titular" value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={60} autoComplete="name" className={ENTRADA} />
          </Rotulo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Rotulo id="pix-banco" texto="Banco da conta de reserva"><input id="pix-banco" value={bancoNome} onChange={(e) => setBancoNome(e.target.value)} maxLength={40} className={ENTRADA} /></Rotulo>
            <Rotulo id="pix-cidade" texto="Sua cidade"><input id="pix-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={40} className={ENTRADA} /></Rotulo>
          </div>
          {erro && <Erro>{erro}</Erro>}
          <BotaoPrincipal tipo="submit">Continuar</BotaoPrincipal>
        </Cartao></form>
      )}

      {passo === 'pin' && (
        <form onSubmit={conferirPin} noValidate><Cartao>
          <h2 className="m-0 text-lg font-extrabold">Crie um PIN de 6 números</h2>
          <p className="m-0 text-sm text-suave">O PIN protege a chave: ela fica guardada com criptografia e só abre com ele. Não use a senha do banco.</p>
          <CampoPin id="pix-pin1" rotulo="PIN" valor={pin1} aoMudar={setPin1} />
          <CampoPin id="pix-pin2" rotulo="Repita o PIN" valor={pin2} aoMudar={setPin2} />
          <p className="m-0 text-xs text-suave">Se esquecer o PIN, só a chave Pix é apagada — seus cofrinhos e lançamentos continuam.</p>
          {erro && <Erro>{erro}</Erro>}
          <BotaoPrincipal tipo="submit" desabilitado={pin1.length !== 6 || pin2.length !== 6}>Continuar</BotaoPrincipal>
        </Cartao></form>
      )}

      {passo === 'teste' && dados && (
        <Cartao>
          <h2 className="m-0 text-lg font-extrabold">Teste com R$ 0,01</h2>
          <ol className="m-0 flex flex-col gap-1 pl-5 text-[15px]">
            <li>Pague este Pix de <strong>R$ 0,01</strong> no app do seu banco principal.</li>
            <li><strong>Antes de confirmar</strong>, veja o nome do destinatário.</li>
            <li>Confirme abaixo o que apareceu.</li>
          </ol>
          {testeConfere ? (
            <div className="flex flex-col items-center gap-3">
              <QrCode texto={codigoTeste} rotulo="QR Code Pix de teste, R$ 0,01" />
              <CopiarCodigo codigo={codigoTeste} />
            </div>
          ) : <Erro>Não foi possível gerar o código de teste. Volte e confira a chave.</Erro>}
          <div className="rounded-2xl bg-fundo p-3 text-sm">
            <p className="m-0">Deve aparecer: <strong>{dados.titular}</strong> · {dados.banco}</p>
            <p className="m-0 flex items-center gap-2">Chave {mascararChave(dados.tipo, dados.chave)} · selo <Selo chave={dados.chave} tamanho={18} /></p>
          </div>
          <BotaoPrincipal aoClicar={() => salvar(true)} desabilitado={ocupado}>Apareceu MEU nome e o R$ 0,01 caiu na minha conta de reserva</BotaoPrincipal>
          <button type="button" onClick={() => irPara('outro-nome')} className="min-h-12 rounded-2xl border-2 border-perigo-texto bg-cartao px-4 font-extrabold text-perigo-texto">Apareceu OUTRO nome</button>
          <button type="button" onClick={() => salvar(false)} disabled={ocupado} className="min-h-11 text-sm font-bold text-primaria">Fazer o teste depois</button>
        </Cartao>
      )}

      {passo === 'outro-nome' && (
        <Cartao>
          <h2 className="m-0 flex items-center gap-2 text-lg font-extrabold text-perigo-texto"><ShieldAlert size={22} aria-hidden="true" />Não pague. A chave foi descartada.</h2>
          <p className="m-0 text-[15px]">Se apareceu outro nome, a chave digitada não é da sua conta de reserva. Pode ter sido um erro de digitação, ou a chave é de outra pessoa.</p>
          <ul className="m-0 flex flex-col gap-1 pl-5 text-sm text-suave">
            <li>Abra o app do banco da reserva e copie a chave Pix de lá (Área Pix → Minhas chaves).</li>
            <li>Se você não fez nada de diferente e mesmo assim a chave mudou, troque o PIN e confira o celular.</li>
          </ul>
          <BotaoPrincipal aoClicar={() => { setChave1(''); setChave2(''); setDados(null); irPara('dados'); }}>Digitar a chave de novo</BotaoPrincipal>
        </Cartao>
      )}
    </div>
  );
}

const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';

function Cartao({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">{children}</section>;
}
function Rotulo({ id, texto, children }: { id: string; texto: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1"><label htmlFor={id} className="text-sm font-bold">{texto}</label>{children}</div>;
}
function Erro({ children }: { children: ReactNode }) {
  return <p role="alert" className="m-0 rounded-xl bg-perigo-fundo p-3 text-sm font-bold text-perigo-texto">{children}</p>;
}
function BotaoPrincipal({ children, aoClicar, desabilitado, tipo = 'button' }: { children: ReactNode; aoClicar?: () => void; desabilitado?: boolean; tipo?: 'button' | 'submit' }) {
  return <button type={tipo} onClick={aoClicar} disabled={desabilitado} className="min-h-12 rounded-2xl bg-primaria px-4 font-extrabold text-white hover:bg-primaria-escura disabled:opacity-50">{children}</button>;
}
