import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { ICONES, IconeCategoria } from '../componentes/ui/IconeCategoria';
import { useAvisos } from '../hooks/useAvisos';
import { useCategorias } from '../hooks/useDados';
import { CORES_CATEGORIA, excluirCategoria, lancamentosDaCategoria, salvarCategoria, validarCategoria } from '../servicos/categorias';
import type { NomeIcone } from '../tipos';
import { lerValor } from '../utils/moeda';

// Criar/editar categoria: nome, cor, ícone, subcategorias e limite do mês.

const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';
const paraCampo = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CategoriaForm() {
  const idTexto = useParams().id;
  const id = idTexto ? Number(idTexto) : undefined;
  const categorias = useCategorias();
  const existente = categorias?.find((c) => c.id === id);
  const uso = useLiveQuery(() => (id ? lancamentosDaCategoria(id) : 0), [id]);
  const navigate = useNavigate();
  const { avisar } = useAvisos();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [cor, setCor] = useState(CORES_CATEGORIA[0]);
  const [icone, setIcone] = useState<NomeIcone>('caixa');
  const [subs, setSubs] = useState<string[]>([]);
  const [novaSub, setNovaSub] = useState('');
  const [limite, setLimite] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [excluindo, setExcluindo] = useState(false);
  const [moverPara, setMoverPara] = useState<number | null>(null);
  const [erroExcluir, setErroExcluir] = useState('');
  const carregado = useRef(false);

  useEffect(() => {
    if (!existente || carregado.current) return;
    carregado.current = true;
    setNome(existente.nome); setTipo(existente.tipo); setCor(existente.cor); setIcone(existente.icone);
    setSubs(existente.subcategorias.map((s) => s.nome)); setLimite(existente.limiteMensal ? paraCampo(existente.limiteMensal) : '');
  }, [existente]);

  if (!categorias) return <p className="text-suave">Carregando…</p>;
  if (id && !existente) return <p className="text-suave">Categoria não encontrada.</p>;

  function adicionarSub() {
    const t = novaSub.trim();
    if (!t) return;
    setSubs((x) => [...x, t]); setNovaSub('');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const limiteMensal = limite.trim() ? lerValor(limite) : null;
    const dados = { nome, tipo, cor, icone, subcategorias: [...subs, ...(novaSub.trim() ? [novaSub.trim()] : [])], limiteMensal };
    const v = validarCategoria(dados, categorias!, id);
    if (limite.trim() && limiteMensal === null) v.limiteMensal = 'Limite inválido. Exemplo: 1.200,00';
    setErros(v);
    if (Object.keys(v).length) { document.getElementById(`categoria-${Object.keys(v)[0]}`)?.focus(); return; }
    await salvarCategoria(dados, id);
    avisar(id ? 'Categoria atualizada.' : `Categoria “${nome.trim()}” criada.`);
    navigate('/categorias', { replace: true });
  }

  async function excluir() {
    setErroExcluir('');
    try {
      await excluirCategoria(id!, moverPara);
      avisar('Categoria excluída.');
      navigate('/categorias', { replace: true });
    } catch (x) { setErroExcluir((x as Error).message); }
  }

  const outras = categorias.filter((c) => c.tipo === tipo && c.id !== id);

  return (
    <form onSubmit={salvar} noValidate className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-tinta hover:bg-primaria-clara"><ArrowLeft size={22} aria-hidden="true" /></button>
        <h1 className="m-0 flex-1 text-xl font-extrabold md:text-2xl">{id ? 'Editar categoria' : 'Nova categoria'}</h1>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: cor }} aria-hidden="true"><IconeCategoria nome={icone} tamanho={20} /></span>
      </div>
      <section className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-4 md:p-5">
        {!id && (
          <div role="radiogroup" aria-label="Tipo" className="flex rounded-2xl bg-borda p-1">
            {(['despesa', 'receita'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)} className={`min-h-11 flex-1 rounded-xl font-extrabold ${tipo === t ? 'bg-cartao shadow' : 'text-suave'}`}>{t === 'despesa' ? 'Despesa' : 'Receita'}</button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="categoria-nome" className="text-sm font-bold">Nome</label>
          <input id="categoria-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: '' })); }} maxLength={40} placeholder="Ex.: Pet, Farmácia, Filhos" className={ENTRADA} />
          {erros.nome && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erros.nome}</p>}
        </div>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {CORES_CATEGORIA.map((c) => (
              <button key={c} type="button" aria-pressed={cor === c} aria-label={`Cor ${c}`} onClick={() => setCor(c)} className={`h-11 w-11 rounded-full ${cor === c ? 'ring-4 ring-primaria ring-offset-2' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold">Ícone</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {(Object.keys(ICONES) as NomeIcone[]).map((i) => (
              <button key={i} type="button" aria-pressed={icone === i} aria-label={`Ícone ${i}`} onClick={() => setIcone(i)} className={`flex h-11 items-center justify-center rounded-xl ${icone === i ? 'bg-primaria text-white' : 'border border-borda-forte bg-cartao text-tinta'}`}>
                <IconeCategoria nome={i} tamanho={20} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold" id="categoria-subcategorias">Subcategorias (opcional)</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {subs.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <label htmlFor={`sub-${i}`} className="sr-only">Subcategoria {i + 1}</label>
                <input id={`sub-${i}`} value={s} onChange={(e) => setSubs((x) => x.map((v, j) => (j === i ? e.target.value : v)))} maxLength={40} className={ENTRADA} />
                <button type="button" onClick={() => setSubs((x) => x.filter((_, j) => j !== i))} aria-label={`Tirar ${s}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-suave"><X size={18} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <label htmlFor="nova-sub" className="sr-only">Nova subcategoria</label>
            <input id="nova-sub" value={novaSub} onChange={(e) => setNovaSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarSub(); } }} maxLength={40} placeholder="Nova subcategoria" className={ENTRADA} />
            <button type="button" onClick={adicionarSub} aria-label="Adicionar subcategoria" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-primaria text-primaria-escura"><Plus size={20} aria-hidden="true" /></button>
          </div>
          {erros.subcategorias && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erros.subcategorias}</p>}
        </div>
        {tipo === 'despesa' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="categoria-limiteMensal" className="text-sm font-bold">Limite de gasto por mês (R$, opcional)</label>
            <input id="categoria-limiteMensal" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="1.200,00" className={ENTRADA} />
            <p className="m-0 text-xs text-suave">O app avisa quando o gasto passar de 80% e de 100% do limite.</p>
            {erros.limiteMensal && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erros.limiteMensal}</p>}
          </div>
        )}
      </section>
      <button type="submit" className="min-h-14 rounded-2xl bg-primaria px-4 text-base font-extrabold text-white">{id ? 'Salvar alterações' : 'Criar categoria'}</button>

      {id && (excluindo ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-status-perigo bg-cartao p-4">
          <p className="m-0 font-bold">Excluir a categoria “{existente!.nome}”?</p>
          {(uso ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="mover-para" className="text-sm">Ela tem <strong>{uso} {uso === 1 ? 'lançamento' : 'lançamentos'}</strong>. Mover para:</label>
              <select id="mover-para" value={moverPara ?? ''} onChange={(e) => setMoverPara(e.target.value ? Number(e.target.value) : null)} className={ENTRADA}>
                <option value="">Escolha a categoria</option>
                {outras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          {erroExcluir && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erroExcluir}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setExcluindo(false)} className="min-h-11 flex-1 rounded-xl border border-borda-forte font-bold">Cancelar</button>
            <button type="button" onClick={excluir} className="min-h-11 flex-1 rounded-xl bg-perigo font-bold text-white">Excluir</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setExcluindo(true)} className="flex min-h-11 items-center gap-2 self-start rounded-xl border border-perigo-texto bg-cartao px-4 font-bold text-perigo-texto"><Trash2 size={18} aria-hidden="true" />Excluir categoria</button>
      ))}
    </form>
  );
}
