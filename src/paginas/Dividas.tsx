import { FileText, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CaixaMensagem } from '../componentes/ui/CaixaMensagem';
import { useEmprestimos, useLancamentosDoMes } from '../hooks/useDados';
import { useRegraSalario } from '../servicos/configuracoes';
import { resumirEmprestimo } from '../servicos/emprestimos';
import { formatarTaxa, NOME_PERIODO } from '../servicos/juros';
import { formatarData, hojeISO, partesDaData } from '../utils/datas';
import { formatarMoeda, formatarPercentual } from '../utils/moeda';

// Lista de empréstimos e financiamentos, com o resumo de quanto falta pagar.

export function Dividas() {
  const dados = useEmprestimos();
  const hoje = hojeISO();
  const { ano, mes } = partesDaData(hoje);
  const lancMes = useLancamentosDoMes(ano, mes);
  const regraSalario = useRegraSalario();
  const resumos = useMemo(() => (dados ?? []).map((d) => resumirEmprestimo(d.emprestimo, d.pagamentos, hoje, regraSalario))
    .sort((a, b) => ({ atrasado: 0, 'em-dia': 1, quitado: 2 })[a.status] - ({ atrasado: 0, 'em-dia': 1, quitado: 2 })[b.status]), [dados, hoje, regraSalario]);

  if (!dados) return <p className="text-suave">Carregando…</p>;
  const ativos = resumos.filter((r) => r.status !== 'quitado');
  const faltaPagar = ativos.reduce((s, r) => s + r.saldoDevedor, 0);
  const parcelasMes = ativos.reduce((s, r) => s + (r.proxima?.valor ?? 0), 0);
  const renda = (lancMes ?? []).filter((l) => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
  const pctRenda = renda > 0 ? (parcelasMes / renda) * 100 : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-2xl font-extrabold">Dívidas</h1>
        <Link to="/dividas/novo" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primaria px-4 text-sm font-extrabold text-white no-underline hover:bg-primaria-escura">
          <Plus size={18} aria-hidden="true" />Cadastrar empréstimo
        </Link>
      </div>

      {resumos.length === 0 ? (
        <section className="rounded-[22px] border border-borda bg-cartao p-5">
          <h2 className="m-0 text-lg font-extrabold">Acompanhe seus empréstimos e financiamentos</h2>
          <ul className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-suave">
            <li>Cadastre cada contrato com o nome que quiser (ex.: “Consignado do carro”) e o número do contrato.</li>
            <li><strong className="text-tinta">Anexe o contrato em PDF</strong>: o app lê a taxa de juros, a multa e os juros de mora, e você confere.</li>
            <li>Veja quanto está pagando de juros, quanto falta, e quanto custa cada dia de atraso.</li>
            <li>Registre os pagamentos: o app avisa atrasos e comemora quando você paga em dia.</li>
          </ul>
          <Link to="/dividas/novo" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primaria px-5 font-extrabold text-white no-underline">
            <Plus size={18} aria-hidden="true" />Cadastrar o primeiro empréstimo
          </Link>
        </section>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-label="Resumo das dívidas">
            <div className="rounded-2xl bg-tinta p-4 text-white"><dt className="text-xs font-semibold text-menu-texto">Falta pagar (para quitar hoje)</dt><dd className="m-0 text-xl font-extrabold">{formatarMoeda(faltaPagar)}</dd></div>
            <div className="rounded-2xl border border-borda bg-cartao p-4"><dt className="text-xs font-semibold text-suave">Parcelas por mês</dt><dd className="m-0 text-xl font-extrabold">{formatarMoeda(parcelasMes)}</dd></div>
            <div className="rounded-2xl border border-borda bg-cartao p-4">
              <dt className="text-xs font-semibold text-suave">Parcelas ÷ renda do mês</dt>
              <dd className="m-0 text-xl font-extrabold">{pctRenda === null ? '—' : formatarPercentual(pctRenda)}
                <span className={`ml-2 text-xs font-bold ${pctRenda === null ? 'text-suave' : pctRenda <= 30 ? 'text-ok-texto' : 'text-perigo-texto'}`}>
                  {pctRenda === null ? 'lance a renda do mês' : pctRenda <= 30 ? 'saudável (até 30%)' : 'acima de 30%'}
                </span>
              </dd>
            </div>
          </dl>

          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
            {resumos.map((r) => {
              const e = r.emprestimo;
              return (
                <li key={e.id}>
                  <Link to={`/dividas/${e.id}`} className={`flex h-full flex-col gap-3 rounded-[22px] bg-cartao p-4 text-tinta no-underline hover:bg-primaria-clara ${r.status === 'atrasado' ? 'border-2 border-status-perigo' : 'border border-borda'}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h2 className="m-0 text-base font-extrabold">{e.nome}</h2>
                        <p className="m-0 text-xs text-suave">{[e.instituicao, e.numeroContrato && `Contrato nº ${e.numeroContrato}`].filter(Boolean).join(' · ') || 'Sem número de contrato'}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold ${r.status === 'atrasado' ? 'bg-perigo-fundo text-perigo-texto' : r.status === 'quitado' ? 'bg-[#E7F6EA] text-ok-texto' : 'bg-[#E7F6EA] text-ok-texto'}`}>
                        {r.status === 'atrasado' ? 'Atrasado' : r.status === 'quitado' ? 'Quitado' : 'Em dia'}
                      </span>
                    </div>
                    <CaixaMensagem mensagem={r.mensagem} />
                    <div>
                      <div className="flex justify-between text-sm"><span>{r.pagas} de {e.numeroParcelas} pagas</span><strong>{formatarPercentual(r.percentualQuitado, 0)} quitado</strong></div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-borda" role="img" aria-label={`${formatarPercentual(r.percentualQuitado, 0)} quitado`}>
                        <div className="h-2.5 rounded-full bg-primaria" style={{ width: `${r.percentualQuitado}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {r.proxima && <span>Parcela: <strong>{formatarMoeda(r.proxima.valor)}</strong> · vence {formatarData(r.proxima.vencimento)}</span>}
                      {r.taxaMensal !== null && <span>Juros: <strong>{formatarTaxa(r.taxaMensal)} {NOME_PERIODO.mes}</strong></span>}
                      {e.contratoArquivoId && <span className="inline-flex items-center gap-1 text-suave"><FileText size={14} aria-hidden="true" />contrato anexado</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
