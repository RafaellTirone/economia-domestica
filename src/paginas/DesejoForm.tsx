import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoData } from '../componentes/ui/CampoData';
import { banco } from '../db/banco';
import { useAvisos } from '../hooks/useAvisos';
import { adicionarMeses, hojeISO } from '../utils/datas';
import { lerValor } from '../utils/moeda';

// Anotar/editar um desejo de compra.

const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';

export function DesejoForm() {
  const idTexto = useParams().id;
  const id = idTexto ? Number(idTexto) : null;
  const existente = useLiveQuery(async () => (id ? (await banco.desejos.get(id)) ?? null : null), [id]);
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState('10');
  const [valorParcela, setValorParcela] = useState('');
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media');
  const [porMes, setPorMes] = useState('');
  const [temData, setTemData] = useState(false);
  const [quando, setQuando] = useState(adicionarMeses(hojeISO(), 6));
  const [erros, setErros] = useState<Record<string, string>>({});
  const carregado = useRef(false);

  useEffect(() => {
    if (!existente || carregado.current) return;
    carregado.current = true;
    setNome(existente.nome); setPreco(paraCampo(existente.precoVista)); setParcelado(!!existente.parcelas);
    if (existente.parcelas) setParcelas(String(existente.parcelas));
    if (existente.valorParcela) setValorParcela(paraCampo(existente.valorParcela));
    setPrioridade(existente.prioridade); setPorMes(existente.guardarPorMes ? paraCampo(existente.guardarPorMes) : '');
    setTemData(!!existente.quando); if (existente.quando) setQuando(existente.quando);
  }, [existente]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    const precoVista = lerValor(preco) ?? 0;
    if (!nome.trim()) v.nome = 'O que você quer comprar?';
    if (!(precoVista > 0)) v.preco = 'Informe o preço à vista.';
    const nParcelas = parcelado ? Number(parcelas) : null;
    const vParcela = parcelado ? lerValor(valorParcela) : null;
    if (parcelado && (!nParcelas || nParcelas < 2 || nParcelas > 72)) v.parcelas = 'Número de parcelas inválido.';
    if (parcelado && !(vParcela && vParcela > 0)) v.valorParcela = 'Informe o valor de cada parcela.';
    setErros(v);
    const primeiro = ['nome', 'preco', 'parcelas', 'valorParcela'].find((k) => v[k]);
    if (primeiro) { document.getElementById(`desejo-${primeiro}`)?.focus(); return; }
    const dados = {
      nome: nome.trim(), precoVista, parcelas: nParcelas, valorParcela: vParcela, prioridade,
      guardarPorMes: porMes.trim() ? lerValor(porMes) : null, quando: temData ? quando : null,
    };
    if (id) await banco.desejos.update(id, dados);
    else await banco.desejos.add({ ...dados, cofrinhoId: null, comprado: false, criadoEm: new Date().toISOString() });
    avisar(id ? 'Desejo atualizado.' : `“${dados.nome}” anotado.`);
    navigate('/desejos', { replace: true });
  }

  if (id && existente === null) return <p className="text-suave">Desejo não encontrado.</p>;

  return (
    <form onSubmit={salvar} noValidate className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></button>
        <h1 className="m-0 text-xl font-extrabold md:text-2xl">{id ? 'Editar desejo' : 'Novo desejo'}</h1>
      </div>
      <section className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
        <Campo id="desejo-nome" rotulo="O que você quer comprar" erro={erros.nome}><input id="desejo-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: '' })); }} maxLength={50} placeholder="Ex.: Viagem para Porto Seguro" className={ENTRADA} /></Campo>
        <Campo id="desejo-preco" rotulo="Preço à vista (R$)" erro={erros.preco}><input id="desejo-preco" inputMode="decimal" value={preco} onChange={(e) => { setPreco(e.target.value.replace(/[^\d.,]/g, '')); setErros((x) => ({ ...x, preco: '' })); }} placeholder="4.000,00" className={ENTRADA} /></Campo>
        <label className="flex min-h-11 items-center gap-3 font-bold"><input id="desejo-parcelado" type="checkbox" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} className="h-6 w-6 accent-primaria" />Também dá para parcelar</label>
        {parcelado && (
          <div className="grid grid-cols-2 gap-3">
            <Campo id="desejo-parcelas" rotulo="Nº de parcelas" erro={erros.parcelas}><input id="desejo-parcelas" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))} className={ENTRADA} /></Campo>
            <Campo id="desejo-valorParcela" rotulo="Valor da parcela (R$)" erro={erros.valorParcela}><input id="desejo-valorParcela" inputMode="decimal" value={valorParcela} onChange={(e) => setValorParcela(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="450,00" className={ENTRADA} /></Campo>
          </div>
        )}
        <Campo id="desejo-prioridade" rotulo="Prioridade">
          <select id="desejo-prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value as typeof prioridade)} className={ENTRADA}>
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </Campo>
        <Campo id="desejo-porMes" rotulo="Quanto consigo guardar por mês para isso (R$, opcional)"><input id="desejo-porMes" inputMode="decimal" value={porMes} onChange={(e) => setPorMes(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="500,00" className={ENTRADA} /></Campo>
        <label className="flex min-h-11 items-center gap-3 font-bold"><input id="desejo-temData" type="checkbox" checked={temData} onChange={(e) => setTemData(e.target.checked)} className="h-6 w-6 accent-primaria" />Quero comprar até uma data</label>
        {temData && <Campo id="desejo-quando" rotulo="Até quando"><CampoData id="desejo-quando" rotulo="Até quando" valor={quando} aoMudar={setQuando} /></Campo>}
      </section>
      <button type="submit" className="min-h-14 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white hover:bg-primaria-escura">{id ? 'Salvar alterações' : 'Salvar desejo'}</button>
    </form>
  );
}

function Campo({ id, rotulo, erro, children }: { id: string; rotulo: string; erro?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{rotulo}</label>
      {children}
      {erro && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erro}</p>}
    </div>
  );
}
