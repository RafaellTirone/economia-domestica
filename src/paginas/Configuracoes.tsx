import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EditorSalario } from '../componentes/ui/EditorSalario';
import { IconeCategoria } from '../componentes/ui/IconeCategoria';
import { useAvisos } from '../hooks/useAvisos';
import { salvarRegraSalario, useRegraSalario } from '../servicos/configuracoes';
import type { RegraSalario } from '../utils/datas';
import { pedirArmazenamentoPersistente, situacaoArmazenamento, type SituacaoArmazenamento } from '../db/armazenamento';
import { useCategorias } from '../hooks/useDados';

// Configurações: proteção dos dados, categorias e privacidade.
export function Configuracoes() {
  const categorias = useCategorias();
  const [protecao, setProtecao] = useState<SituacaoArmazenamento | null>(null);
  const regraSalva = useRegraSalario();
  const [regra, setRegra] = useState<RegraSalario>({ tipo: 'dia', dia: 5 });
  const { avisar } = useAvisos();
  useEffect(() => { if (regraSalva) setRegra(regraSalva); }, [regraSalva]);
  useEffect(() => { situacaoArmazenamento().then(setProtecao); }, []);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-2xl font-extrabold">Configurações</h1>

      <section aria-labelledby="titulo-dados" className="rounded-[22px] border border-borda bg-cartao p-5">
        <h2 id="titulo-dados" className="m-0 text-lg font-extrabold">Seus dados</h2>
        <p className="m-0 mt-1 text-sm text-suave">Tudo fica salvo só neste aparelho. Nada é enviado para a internet.</p>
        <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 text-sm ${protecao === 'protegido' ? 'bg-[#E7F6EA] text-ok-texto' : 'bg-alerta-fundo text-alerta-texto'}`}>
          {protecao === 'protegido' ? <ShieldCheck size={22} aria-hidden="true" className="shrink-0" /> : <ShieldAlert size={22} aria-hidden="true" className="shrink-0" />}
          <div data-testid="situacao-armazenamento">
            {protecao === 'protegido' && <p className="m-0 font-bold">Protegido: o navegador não vai apagar seus dados para liberar espaço.</p>}
            {protecao === 'nao-protegido' && (
              <>
                <p className="m-0 font-bold">Atenção: o navegador pode apagar os dados se faltar espaço.</p>
                <p className="m-0 mt-1">No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início). Faça backups com frequência.</p>
                <button type="button" onClick={() => pedirArmazenamentoPersistente().then(setProtecao)}
                  className="mt-3 min-h-11 rounded-xl border border-alerta-texto bg-cartao px-4 font-bold text-alerta-texto">Pedir proteção</button>
              </>
            )}
            {protecao === 'indisponivel' && <p className="m-0 font-bold">Este navegador não informa a proteção dos dados. Faça backups com frequência.</p>}
            {protecao === null && <p className="m-0">Verificando…</p>}
          </div>
        </div>
        <p className="m-0 mt-3 text-sm text-suave">Backup (exportar e importar arquivo) chega na etapa 11.</p>
      </section>

      <section aria-labelledby="titulo-salario" className="rounded-[22px] border border-borda bg-cartao p-5">
        <h2 id="titulo-salario" className="m-0 text-lg font-extrabold">Dia do pagamento do salário</h2>
        <p className="m-0 mb-3 mt-1 text-sm text-suave">Usado no empréstimo consignado (desconto em folha) e nos lembretes. {regraSalva === null ? 'Ainda não cadastrado.' : ''}</p>
        <EditorSalario valor={regra} aoMudar={setRegra} prefixo="config-salario" />
        <button type="button" onClick={() => salvarRegraSalario(regra).then(() => avisar('Dia do salário salvo.'))}
          className="mt-3 min-h-11 rounded-xl bg-primaria px-4 font-bold text-white hover:bg-primaria-escura">Salvar dia do salário</button>
      </section>

      <section aria-labelledby="titulo-categorias" className="rounded-[22px] border border-borda bg-cartao p-5">
        <h2 id="titulo-categorias" className="m-0 text-lg font-extrabold">Categorias ({categorias?.length ?? '…'})</h2>
        <p className="m-0 mt-1 text-sm text-suave">Criar, editar e excluir categorias chega na etapa 4.</p>
        {(['despesa', 'receita'] as const).map((tipo) => (
          <div key={tipo} className="mt-4">
            <h3 className="m-0 text-sm font-bold text-suave">{tipo === 'despesa' ? 'Despesas' : 'Receitas'}</h3>
            <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
              {categorias?.filter((c) => c.tipo === tipo).map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-xl border border-borda p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: c.cor }}>
                    <IconeCategoria nome={c.icone} tamanho={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 font-bold">{c.nome}</p>
                    <p className="m-0 text-xs text-suave">{c.subcategorias.map((s) => s.nome).join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="titulo-privacidade" className="rounded-[22px] border border-borda bg-cartao p-5 text-sm">
        <h2 id="titulo-privacidade" className="m-0 text-lg font-extrabold">Privacidade e avisos</h2>
        <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-suave">
          <li>Sem cadastro, sem login e sem servidor: o app não coleta nenhum dado.</li>
          <li>O app nunca pede senha de banco, dados de cartão ou códigos de segurança.</li>
          <li>Cálculos de juros e projeções são estimativas e não substituem a orientação da instituição financeira.</li>
        </ul>
        <p className="m-0 mt-3 text-xs text-suave">Versão {__VERSAO__}</p>
      </section>
    </div>
  );
}
