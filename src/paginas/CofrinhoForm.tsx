import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CampoData } from '../componentes/ui/CampoData';
import { banco } from '../db/banco';
import { useAvisos } from '../hooks/useAvisos';
import { useCofrinho } from '../hooks/useDados';
import { ONDE_GUARDA, validarCofrinho } from '../servicos/cofrinhos';
import type { OndeGuarda } from '../tipos';
import { adicionarMeses, hojeISO } from '../utils/datas';
import { lerValor } from '../utils/moeda';

// Criar/editar cofrinho: nome, meta, prazo (opcional), onde o dinheiro fica e rendimento estimado.

const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';

export function CofrinhoForm() {
  const { id: idTexto } = useParams();
  const [params] = useSearchParams();
  const id = idTexto ? Number(idTexto) : null;
  const existente = useCofrinho(id);
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const [nome, setNome] = useState(params.get('nome') ?? '');
  const [meta, setMeta] = useState(params.get('meta') ? paraCampo(Number(params.get('meta'))) : '');
  const [temPrazo, setTemPrazo] = useState(!!params.get('prazo'));
  const [prazo, setPrazo] = useState(params.get('prazo') ?? adicionarMeses(hojeISO(), 12));
  const [onde, setOnde] = useState<OndeGuarda>('caixinha');
  const [rendimento, setRendimento] = useState('');
  const [deposito, setDeposito] = useState(params.get('mensal') ? paraCampo(Number(params.get('mensal'))) : '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const carregado = useRef(false);

  useEffect(() => {
    if (!existente || carregado.current) return;
    carregado.current = true;
    const c = existente.cofrinho;
    setNome(c.nome); setMeta(paraCampo(c.meta)); setTemPrazo(!!c.prazo); if (c.prazo) setPrazo(c.prazo);
    setOnde(c.ondeGuarda); setRendimento(c.rendimentoMensal === null ? '' : String(c.rendimentoMensal).replace('.', ','));
    setDeposito(c.depositoMensal ? paraCampo(c.depositoMensal) : '');
  }, [existente]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const rend = rendimento.trim() ? Number(rendimento.replace(',', '.')) : null;
    const dados = {
      nome: nome.trim(), meta: lerValor(meta) ?? 0, prazo: temPrazo ? prazo : null, ondeGuarda: onde,
      rendimentoMensal: rend, depositoMensal: deposito.trim() ? lerValor(deposito) : null,
    };
    const v = validarCofrinho(dados);
    if (rend !== null && Number.isNaN(rend)) v.rendimentoMensal = 'Rendimento inválido. Exemplo: 0,8';
    setErros(v);
    const primeiro = ['nome', 'meta', 'rendimentoMensal'].find((k) => v[k]);
    if (primeiro) { document.getElementById(`cofrinho-${primeiro}`)?.focus(); return; }
    if (id) {
      await banco.cofrinhos.update(id, dados);
      avisar('Cofrinho atualizado.');
      navigate(`/cofrinhos/${id}`, { replace: true });
    } else {
      const novo = await banco.cofrinhos.add({ ...dados, criadoEm: new Date().toISOString() });
      const desejoId = params.get('desejo');
      if (desejoId) await banco.desejos.update(Number(desejoId), { cofrinhoId: novo });
      avisar(`Cofrinho “${dados.nome}” criado.`);
      navigate(`/cofrinhos/${novo}`, { replace: true });
    }
  }

  if (id && existente === null) return <p className="text-suave">Cofrinho não encontrado.</p>;

  return (
    <form onSubmit={salvar} noValidate className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></button>
        <h1 className="m-0 text-xl font-extrabold md:text-2xl">{id ? 'Editar cofrinho' : 'Novo cofrinho'}</h1>
      </div>
      <section className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
        <Campo id="cofrinho-nome" rotulo="Nome do objetivo" erro={erros.nome}>
          <input id="cofrinho-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: '' })); }} maxLength={50} placeholder="Ex.: Reserva de emergência" className={ENTRADA} />
        </Campo>
        <Campo id="cofrinho-meta" rotulo="Meta (R$)" erro={erros.meta}>
          <input id="cofrinho-meta" inputMode="decimal" value={meta} onChange={(e) => { setMeta(e.target.value.replace(/[^\d.,]/g, '')); setErros((x) => ({ ...x, meta: '' })); }} placeholder="5.000,00" className={ENTRADA} />
        </Campo>
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
          <input id="cofrinho-temPrazo" type="checkbox" checked={temPrazo} onChange={(e) => setTemPrazo(e.target.checked)} className="h-6 w-6 accent-primaria" />Tenho uma data para chegar na meta
        </label>
        {temPrazo && <Campo id="cofrinho-prazo" rotulo="Até quando"><CampoData id="cofrinho-prazo" rotulo="Até quando" valor={prazo} aoMudar={setPrazo} /></Campo>}
        <Campo id="cofrinho-onde" rotulo="Onde o dinheiro fica (sempre no seu nome)">
          <select id="cofrinho-onde" value={onde} onChange={(e) => setOnde(e.target.value as OndeGuarda)} className={ENTRADA}>
            {Object.entries(ONDE_GUARDA).map(([v, o]) => <option key={v} value={v}>{o.nome}</option>)}
          </select>
          {ONDE_GUARDA[onde].descricao && <p className="m-0 text-xs text-suave">{ONDE_GUARDA[onde].descricao}</p>}
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="cofrinho-rendimentoMensal" rotulo="Rendimento (% ao mês, opcional)" erro={erros.rendimentoMensal} dica="Veja no app do banco. É uma estimativa, sem descontar imposto.">
            <input id="cofrinho-rendimentoMensal" inputMode="decimal" value={rendimento} onChange={(e) => { setRendimento(e.target.value.replace(/[^\d.,]/g, '')); setErros((x) => ({ ...x, rendimentoMensal: '' })); }} placeholder="0,8" className={ENTRADA} />
          </Campo>
          <Campo id="cofrinho-deposito" rotulo="Pretendo guardar por mês (R$, opcional)" dica="Usado na previsão até você começar a guardar.">
            <input id="cofrinho-deposito" inputMode="decimal" value={deposito} onChange={(e) => setDeposito(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="300,00" className={ENTRADA} />
          </Campo>
        </div>
      </section>
      <button type="submit" className="min-h-14 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white hover:bg-primaria-escura">{id ? 'Salvar alterações' : 'Criar cofrinho'}</button>
    </form>
  );
}

function Campo({ id, rotulo, erro, dica, children }: { id: string; rotulo: string; erro?: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{rotulo}</label>
      {children}
      {dica && !erro && <p className="m-0 text-xs text-suave">{dica}</p>}
      {erro && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erro}</p>}
    </div>
  );
}
