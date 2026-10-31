import { Check, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { banco } from '../db/banco';
import { useAvisos } from '../hooks/useAvisos';
import { useCategorias, useCofrinhos, useDesejos, useEmprestimos, useTodosLancamentos } from '../hooks/useDados';
import { resumirCofrinho } from '../servicos/cofrinhos';
import { useRegraSalario } from '../servicos/configuracoes';
import { resumirEmprestimo } from '../servicos/emprestimos';
import { analisarDesejo, HORIZONTES, juntarEm, mediaMensal, ordenarDesejos, sobraComCenario, type AnaliseDesejo } from '../servicos/planejamento';
import { formatarMesAno, partesDaData } from '../utils/datas';
import { formatarMoeda, formatarPercentual, lerValor } from '../utils/moeda';

// Planejar: quanto você consegue guardar (com rendimento e cenários) e os desejos de compra.

const CABE = {
  folgado: { texto: 'Cabe com folga no que sobra por mês', classe: 'bg-[#E7F6EA] text-ok-texto' },
  apertado: { texto: 'Cabe, mas usa quase tudo o que sobra', classe: 'bg-alerta-fundo text-alerta-texto' },
  'nao-cabe': { texto: 'Não cabe no que sobra hoje', classe: 'bg-perigo-fundo text-perigo-texto' },
};

export function Desejos() {
  const lancamentos = useTodosLancamentos();
  const categorias = useCategorias();
  const desejos = useDesejos();
  const cofrinhos = useCofrinhos();
  const emprestimos = useEmprestimos();
  const regra = useRegraSalario();
  const { avisar } = useAvisos();
  const [taxaTexto, setTaxaTexto] = useState('0,8');
  const [corteCategoria, setCorteCategoria] = useState<number | null>(null);
  const [cortePct, setCortePct] = useState(10);
  const [extraTexto, setExtraTexto] = useState('');

  const media = useMemo(() => (lancamentos ? mediaMensal(lancamentos) : null), [lancamentos]);
  if (!lancamentos || !categorias || !desejos || !cofrinhos || !emprestimos) return <p className="text-suave">Carregando…</p>;
  const taxa = Number(taxaTexto.replace(',', '.')) || 0;
  const temDados = lancamentos.some((l) => l.tipo !== 'guardado');
  const sobraCenario = media ? sobraComCenario(media, { categoriaId: corteCategoria, percentual: cortePct }, lerValor(extraTexto) ?? 0) : 0;

  // Empréstimos que terminam: o valor da parcela passa a sobrar
  const terminam = emprestimos.map((d) => resumirEmprestimo(d.emprestimo, d.pagamentos, undefined, regra))
    .filter((r) => r.status !== 'quitado').map((r) => ({ nome: r.emprestimo.nome, parcela: r.emprestimo.valorParcela, fim: r.parcelas[r.parcelas.length - 1].vencimento }))
    .sort((a, b) => a.fim.localeCompare(b.fim));

  const saldoCofrinho = new Map(cofrinhos.map((c) => [c.cofrinho.id!, resumirCofrinho(c.cofrinho, c.movimentos).saldo]));
  const ativos = ordenarDesejos(desejos.filter((d) => !d.comprado)).map((d) => analisarDesejo(d, media && temDados ? media : null, d.cofrinhoId ? saldoCofrinho.get(d.cofrinhoId) ?? 0 : 0));
  const comprados = desejos.filter((d) => d.comprado);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Desejos e planos</h1>
        <Link to="/desejos/novo" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline hover:bg-primaria-escura"><Plus size={18} aria-hidden="true" />Novo desejo</Link>
      </div>

      {/* Estimativa de poupança */}
      <section aria-labelledby="titulo-poupanca" className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
        <h2 id="titulo-poupanca" className="m-0 text-lg font-extrabold">Quanto você consegue guardar</h2>
        {!temDados || !media ? (
          <p className="m-0 text-sm text-suave">Lance suas receitas e despesas: o app calcula a média e mostra quanto você junta em 1 mês, 6 meses, 1 ano e 5 anos.</p>
        ) : (
          <>
            <dl className="m-0 grid grid-cols-3 gap-2 text-sm" data-testid="media-mensal">
              <div className="rounded-xl bg-fundo p-3"><dt className="text-xs text-suave">Ganha (média)</dt><dd className="m-0 font-extrabold">{formatarMoeda(media.receitas)}</dd></div>
              <div className="rounded-xl bg-fundo p-3"><dt className="text-xs text-suave">Gasta (média)</dt><dd className="m-0 font-extrabold">{formatarMoeda(media.despesas)}</dd></div>
              <div className="rounded-xl bg-fundo p-3"><dt className="text-xs text-suave">Sobra por mês</dt><dd className={`m-0 font-extrabold ${media.sobra >= 0 ? 'text-ok-texto' : 'text-perigo-texto'}`}>{formatarMoeda(media.sobra)}</dd></div>
            </dl>
            <p className="m-0 text-xs text-suave">Média de {media.meses === 1 ? 'este mês' : `${media.meses} meses`}{media.receitas > 0 ? ` · você guarda ${formatarPercentual((media.sobra / media.receitas) * 100)} do que ganha` : ''}.</p>
            {media.sobra > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-sm" data-testid="tabela-projecao">
                  <thead><tr className="text-left text-xs text-suave"><th className="py-1.5">Guardando a sobra por</th><th className="py-1.5 text-right">Parado</th><th className="py-1.5 text-right">Rendendo {taxaTexto}% ao mês</th></tr></thead>
                  <tbody>
                    {HORIZONTES.map((h) => (
                      <tr key={h.meses} className="border-t border-borda" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <td className="py-2">{h.nome}</td>
                        <td className="py-2 text-right font-bold">{formatarMoeda(juntarEm(media.sobra, h.meses))}</td>
                        <td className="py-2 text-right font-bold text-primaria-escura">{formatarMoeda(juntarEm(media.sobra, h.meses, taxa))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">Rendimento (% ao mês, editável):</span>
              <input id="taxa-projecao" inputMode="decimal" value={taxaTexto} onChange={(e) => setTaxaTexto(e.target.value.replace(/[^\d,]/g, ''))} className="min-h-11 w-24 rounded-xl border border-borda-forte bg-cartao px-3 text-base" />
              <span className="text-xs text-suave">Estimativa sem impostos. Veja a taxa no seu banco.</span>
            </label>

            <details className="rounded-2xl bg-fundo p-3">
              <summary className="flex min-h-11 cursor-pointer items-center font-extrabold text-primaria-escura">E se…? (simular cortes e renda extra)</summary>
              <div className="mt-2 flex flex-col gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="cenario-categoria" className="font-bold">Cortar</label>
                  <select id="cenario-pct" aria-label="Percentual do corte" value={cortePct} onChange={(e) => setCortePct(Number(e.target.value))} className="min-h-11 rounded-xl border border-borda-forte bg-cartao px-2">
                    {[10, 20, 30, 50].map((p) => <option key={p} value={p}>{p}%</option>)}
                  </select>
                  <span>de</span>
                  <select id="cenario-categoria" value={corteCategoria ?? ''} onChange={(e) => setCorteCategoria(e.target.value ? Number(e.target.value) : null)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-borda-forte bg-cartao px-2">
                    <option value="">(nenhuma categoria)</option>
                    {categorias.filter((c) => c.tipo === 'despesa' && (media.porCategoria.get(c.id!) ?? 0) > 0).map((c) => <option key={c.id} value={c.id}>{c.nome} ({formatarMoeda(media.porCategoria.get(c.id!) ?? 0)}/mês)</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="cenario-extra" className="font-bold">Renda extra por mês (R$)</label>
                  <input id="cenario-extra" inputMode="decimal" value={extraTexto} onChange={(e) => setExtraTexto(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" className="min-h-11 w-32 rounded-xl border border-borda-forte bg-cartao px-3 text-base" />
                </div>
                <p className="m-0 rounded-xl bg-cartao p-3" data-testid="resultado-cenario">Sobra por mês: <strong>{formatarMoeda(sobraCenario)}</strong> ({sobraCenario >= media.sobra ? '+' : ''}{formatarMoeda(sobraCenario - media.sobra)}). Em 1 ano: <strong>{formatarMoeda(juntarEm(sobraCenario, 12, taxa))}</strong> rendendo.</p>
              </div>
            </details>
          </>
        )}
        {terminam.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm" data-testid="fim-emprestimos">
            {terminam.map((t) => {
              const { ano, mes } = partesDaData(t.fim);
              return <li key={t.nome} className="rounded-xl bg-primaria-clara p-3 text-[#2E2860]">Quando <strong>{t.nome}</strong> terminar ({formatarMesAno(ano, mes)}), sobram <strong>+{formatarMoeda(t.parcela)} por mês</strong> — dá para mandar para um cofrinho.</li>;
            })}
          </ul>
        )}
      </section>

      {/* Desejos */}
      <section aria-labelledby="titulo-desejos" className="flex flex-col gap-3">
        <h2 id="titulo-desejos" className="m-0 text-lg font-extrabold">Desejos de compra</h2>
        {ativos.length === 0 ? (
          <div className="rounded-[22px] border border-borda bg-cartao p-5">
            <p className="m-0 text-sm text-suave">Anote o que você quer comprar (viagem, TV, sofá). O app compara à vista com parcelado e mostra em quanto tempo você consegue, guardando um valor por mês.</p>
            <Link to="/desejos/novo" className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primaria px-5 font-extrabold text-white no-underline"><Plus size={18} aria-hidden="true" />Anotar o primeiro desejo</Link>
          </div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
            {ativos.map((a, i) => <CartaoDesejo key={a.desejo.id} a={a} ordem={i + 1} aoComprar={() => banco.desejos.update(a.desejo.id!, { comprado: true }).then(() => avisar(`“${a.desejo.nome}” marcado como comprado. Parabéns!`, { rotulo: 'Desfazer', executar: () => void banco.desejos.update(a.desejo.id!, { comprado: false }) }))}
              aoExcluir={() => { const copia = a.desejo; void banco.desejos.delete(copia.id!).then(() => avisar('Desejo excluído.', { rotulo: 'Desfazer', executar: () => void banco.desejos.put(copia) })); }} />)}
          </ul>
        )}
        {comprados.length > 0 && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-primaria">Já comprados ({comprados.length})</summary>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-suave">{comprados.map((d) => <li key={d.id}>✓ {d.nome} — {formatarMoeda(d.precoVista)}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  );
}

function CartaoDesejo({ a, ordem, aoComprar, aoExcluir }: { a: AnaliseDesejo; ordem: number; aoComprar: () => void; aoExcluir: () => void }) {
  const d = a.desejo;
  return (
    <li className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-4" data-testid="cartao-desejo">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primaria-clara text-sm font-extrabold text-primaria-escura" aria-label={`${ordem}º na ordem sugerida`}>{ordem}</span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-base font-extrabold">{d.nome}</h3>
          <p className="m-0 text-xs text-suave">Prioridade {d.prioridade === 'alta' ? 'alta' : d.prioridade === 'media' ? 'média' : 'baixa'}</p>
        </div>
        <Link to={`/desejos/${d.id}/editar`} aria-label={`Editar ${d.nome}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-tinta"><Pencil size={16} aria-hidden="true" /></Link>
        <button type="button" onClick={aoExcluir} aria-label={`Excluir ${d.nome}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-suave hover:text-perigo-texto"><Trash2 size={16} aria-hidden="true" /></button>
      </div>
      <p className="m-0 text-sm">À vista <strong>{formatarMoeda(d.precoVista)}</strong>{a.totalParcelado !== null && <> · parcelado {d.parcelas}x de {formatarMoeda(d.valorParcela!)} (= {formatarMoeda(a.totalParcelado)})</>}</p>
      {a.aMaisParcelando > 0 && <p className="m-0 rounded-xl bg-[#E7F6EA] p-2.5 text-sm font-bold text-ok-texto">Juntando e pagando à vista, você economiza {formatarMoeda(a.aMaisParcelando)}.</p>}
      {a.pesoParcelaNaRenda !== null && <p className="m-0 text-xs text-suave">Parcelar agora compromete {formatarPercentual(a.pesoParcelaNaRenda)} da sua renda por {d.parcelas} meses.</p>}
      {a.jaGuardado > 0 && <p className="m-0 text-sm">Já guardado no cofrinho: <strong>{formatarMoeda(a.jaGuardado)}</strong> · faltam {formatarMoeda(a.falta)}</p>}
      {a.meses !== null && a.quando && (
        <p className="m-0 text-sm" data-testid="previsao-desejo">Guardando <strong>{formatarMoeda(d.guardarPorMes!)}/mês</strong>, você consegue em <strong>{a.meses} {a.meses === 1 ? 'mês' : 'meses'} ({formatarMesAno(a.quando.ano, a.quando.mes)})</strong>.</p>
      )}
      {a.precisaPorMes !== null && d.quando && <p className="m-0 text-sm">Para comprar até {formatarMesAno(partesDaData(d.quando).ano, partesDaData(d.quando).mes)}: guarde <strong>{formatarMoeda(a.precisaPorMes)}/mês</strong>.</p>}
      {a.cabe && <p className={`m-0 rounded-xl p-2 text-xs font-bold ${CABE[a.cabe].classe}`}>{CABE[a.cabe].texto}</p>}
      <div className="flex flex-wrap gap-2">
        {d.cofrinhoId ? (
          <Link to={`/cofrinhos/${d.cofrinhoId}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-primaria px-3 text-sm font-extrabold text-primaria-escura no-underline"><PiggyBank size={16} aria-hidden="true" />Ver cofrinho</Link>
        ) : (
          <Link to={`/cofrinhos/novo?nome=${encodeURIComponent(d.nome)}&meta=${d.precoVista}${d.guardarPorMes ? `&mensal=${d.guardarPorMes}` : ''}${d.quando ? `&prazo=${d.quando}` : ''}&desejo=${d.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-3 text-sm font-extrabold text-white no-underline"><PiggyBank size={16} aria-hidden="true" />Transformar em cofrinho</Link>
        )}
        <button type="button" onClick={aoComprar} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-borda-forte px-3 text-sm font-bold text-tinta"><Check size={16} aria-hidden="true" />Já comprei</button>
      </div>
    </li>
  );
}
