import { KeyRound, Plus, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pote } from '../componentes/ui/Pote';
import { useAvisos } from '../hooks/useAvisos';
import { useCofrinhos } from '../hooks/useDados';
import { ONDE_GUARDA, resumirCofrinho, textoPrevisao } from '../servicos/cofrinhos';
import { apagarChavePix, useRegistroPix } from '../servicos/pixSeguro';
import { formatarDataHora } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';

// Lista de cofrinhos (metas de economia) e a situação da chave Pix da reserva.

export function Cofrinhos() {
  const dados = useCofrinhos();
  const registro = useRegistroPix();
  const { avisar } = useAvisos();
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const resumos = useMemo(() => (dados ?? []).map((d) => resumirCofrinho(d.cofrinho, d.movimentos)), [dados]);
  if (!dados || registro === undefined) return <p className="text-suave">Carregando…</p>;
  const total = resumos.reduce((s, r) => s + r.saldo, 0);
  const verificada = registro?.historico.at(-1)?.evento.includes('verificada') && !registro.historico.at(-1)?.evento.includes('ainda não');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Cofrinhos</h1>
        <Link to="/cofrinhos/novo" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline hover:bg-primaria-escura">
          <Plus size={18} aria-hidden="true" />Novo cofrinho
        </Link>
      </div>

      {resumos.length > 0 && (
        <div className="rounded-2xl bg-tinta p-4 text-white">
          <p className="m-0 text-xs font-semibold text-menu-texto">Total guardado nos cofrinhos</p>
          <p className="m-0 text-2xl font-extrabold" data-testid="total-cofrinhos">{formatarMoeda(total)}</p>
        </div>
      )}

      {/* Chave Pix da reserva */}
      <section aria-labelledby="titulo-pix" className="flex flex-col gap-2 rounded-[22px] border border-borda bg-cartao p-4">
        <h2 id="titulo-pix" className="m-0 flex items-center gap-2 text-base font-extrabold">
          {registro ? <ShieldCheck size={20} aria-hidden="true" className="text-ok-texto" /> : <ShieldQuestion size={20} aria-hidden="true" className="text-suave" />}
          Pix da conta de reserva
        </h2>
        {registro ? (
          <>
            <p className="m-0 text-sm" data-testid="situacao-pix">Chave {registro.mascara} · {verificada ? <strong className="text-ok-texto">verificada</strong> : <strong className="text-alerta-texto">ainda não verificada (faça o teste de R$ 0,01)</strong>} · protegida por PIN</p>
            <details className="text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-primaria">Histórico da chave</summary>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-suave">
                {[...registro.historico].reverse().map((h) => <li key={h.em}>{formatarDataHora(h.em)} — {h.evento}</li>)}
              </ul>
            </details>
            <div className="flex flex-wrap gap-2">
              <Link to="/cofrinhos/pix" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte px-3 text-sm font-bold text-tinta no-underline"><KeyRound size={16} aria-hidden="true" />{verificada ? 'Trocar chave' : 'Fazer o teste / trocar chave'}</Link>
              <button type="button" onClick={() => setConfirmarApagar(true)} className="min-h-11 rounded-xl px-3 text-sm font-bold text-perigo-texto">Esqueci o PIN</button>
            </div>
            {confirmarApagar && (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-status-perigo p-3 text-sm">
                <p className="m-0 font-bold">Apagar a chave Pix guardada? Você cadastra e testa de novo. Cofrinhos e lançamentos continuam.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmarApagar(false)} className="min-h-11 flex-1 rounded-xl border border-borda-forte font-bold">Cancelar</button>
                  <button type="button" onClick={() => apagarChavePix().then(() => { setConfirmarApagar(false); avisar('Chave Pix apagada.'); })} className="min-h-11 flex-1 rounded-xl bg-perigo font-bold text-white">Apagar chave</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="m-0 text-sm text-suave">Cadastre a chave Pix da sua conta de reserva para usar o “Guardar agora”: o app gera o Pix e você paga no app do banco, de uma conta sua para outra conta sua.</p>
            <Link to="/cofrinhos/pix" className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl border-2 border-primaria px-3 text-sm font-extrabold text-primaria-escura no-underline"><KeyRound size={16} aria-hidden="true" />Cadastrar chave Pix</Link>
          </>
        )}
      </section>

      {resumos.length === 0 ? (
        <section className="rounded-[22px] border border-borda bg-cartao p-5">
          <h2 className="m-0 text-lg font-extrabold">Guarde dinheiro com um objetivo</h2>
          <p className="m-0 mt-2 text-sm text-suave">Crie um cofrinho para cada meta (reserva de emergência, viagem, troca do carro). O dinheiro fica numa conta ou aplicação <strong className="text-tinta">no seu nome</strong> — o app acompanha quanto falta e quando você chega lá.</p>
          <Link to="/cofrinhos/novo" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primaria px-5 font-extrabold text-white no-underline"><Plus size={18} aria-hidden="true" />Criar o primeiro cofrinho</Link>
        </section>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
          {resumos.map((r) => (
            <li key={r.cofrinho.id}>
              <Link to={`/cofrinhos/${r.cofrinho.id}`} className={`flex h-full items-center gap-4 rounded-[22px] bg-cartao p-4 text-tinta no-underline hover:bg-primaria-clara ${r.atingido ? 'border-2 border-status-ok' : 'border border-borda'}`}>
                <Pote percentual={r.percentual} tamanho={52} />
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-base font-extrabold">{r.cofrinho.nome}</h2>
                  <p className="m-0 text-sm"><strong>{formatarMoeda(r.saldo)}</strong> de {formatarMoeda(r.cofrinho.meta)} · {formatarPercentual(r.percentual, 0)}</p>
                  <p className="m-0 text-xs text-suave">{ONDE_GUARDA[r.cofrinho.ondeGuarda].nome}{r.rendimentoEstimadoMes > 0 ? ` · rende ~${formatarMoeda(r.rendimentoEstimadoMes)}/mês` : ''}</p>
                  <p className={`m-0 mt-1 text-xs font-bold ${r.atingido ? 'text-ok-texto' : 'text-primaria-escura'}`}>{textoPrevisao(r)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
