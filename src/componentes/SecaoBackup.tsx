import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { useAvisos } from '../hooks/useAvisos';
import { BackupInvalido, gerarArquivoBackup, lerArquivoBackup, PrecisaSenha, registrarBackupFeito, restaurarBackup, SenhaIncorreta, useUltimoBackup, type ResumoBackup } from '../servicos/backup';
import { baixarArquivo, gerarCsv, linhasLancamentos } from '../servicos/relatorios';
import { banco } from '../db/banco';
import { dataLocalDeInstante, diferencaEmDias, formatarData, formatarDataHora, hojeISO } from '../utils/datas';

// Backup em Configurações: baixar (com senha opcional), planilha de lançamentos e restaurar.

const ENTRADA = 'min-h-12 w-full rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';

export function SecaoBackup() {
  const ultimo = useUltimoBackup();
  const { avisar } = useAvisos();
  const [comSenha, setComSenha] = useState(false);
  const [senha1, setSenha1] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erroExportar, setErroExportar] = useState('');
  const [gerando, setGerando] = useState(false);
  // restaurar
  const [textoArquivo, setTextoArquivo] = useState<string | null>(null);
  const [senhaArquivo, setSenhaArquivo] = useState('');
  const [pedeSenha, setPedeSenha] = useState(false);
  const [resumo, setResumo] = useState<ResumoBackup | null>(null);
  const [erroImportar, setErroImportar] = useState('');
  const [entendi, setEntendi] = useState(false);
  const [restaurando, setRestaurando] = useState(false);

  const diasSemBackup = ultimo ? diferencaEmDias(dataLocalDeInstante(ultimo), hojeISO()) : null;

  async function baixar() {
    setErroExportar('');
    if (comSenha) {
      if (senha1.length < 6) return setErroExportar('A senha precisa ter pelo menos 6 caracteres.');
      if (senha1 !== senha2) return setErroExportar('As duas senhas não são iguais.');
    }
    setGerando(true);
    try {
      const texto = await gerarArquivoBackup(comSenha ? senha1 : undefined);
      baixarArquivo(`nosso-dinheiro-backup-${hojeISO()}.json`, texto, 'application/json');
      await registrarBackupFeito();
      avisar('Backup baixado. Guarde o arquivo num lugar seguro (e-mail, nuvem ou pen drive).');
      setSenha1(''); setSenha2('');
    } finally { setGerando(false); }
  }

  async function baixarPlanilha() {
    const [lista, categorias] = await Promise.all([banco.lancamentos.orderBy('data').toArray(), banco.categorias.toArray()]);
    baixarArquivo(`nosso-dinheiro-lancamentos-${hojeISO()}.csv`, gerarCsv(linhasLancamentos(lista, categorias)));
  }

  async function conferir(texto: string, senha?: string) {
    setErroImportar(''); setResumo(null);
    try {
      setResumo(await lerArquivoBackup(texto, senha));
      setPedeSenha(false);
    } catch (e) {
      if (e instanceof PrecisaSenha) setPedeSenha(true);
      else if (e instanceof SenhaIncorreta) setErroImportar('Senha incorreta (ou o arquivo foi alterado).');
      else if (e instanceof BackupInvalido) setErroImportar(e.message);
      else setErroImportar('Não foi possível ler este arquivo.');
    }
  }

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    setEntendi(false); setSenhaArquivo('');
    if (f.size > 200 * 1024 * 1024) return setErroImportar('Arquivo grande demais para ser um backup do app.');
    const texto = await f.text();
    setTextoArquivo(texto);
    await conferir(texto);
  }

  async function restaurar() {
    if (!resumo || !entendi) return;
    setRestaurando(true);
    try {
      await restaurarBackup(resumo.dados);
      avisar('Backup restaurado. Por segurança, cadastre e teste de novo a chave Pix em Cofrinhos.');
      setResumo(null); setTextoArquivo(null); setEntendi(false);
    } finally { setRestaurando(false); }
  }

  return (
    <section aria-labelledby="titulo-backup" className="flex flex-col gap-4 rounded-[22px] border border-borda bg-cartao p-5">
      <div>
        <h2 id="titulo-backup" className="m-0 text-lg font-extrabold">Backup (cópia de segurança)</h2>
        <p className="m-0 mt-1 text-sm text-suave">Se você limpar o navegador ou trocar de celular, os dados só voltam com um backup. Ele leva tudo: lançamentos, dívidas e contratos, cofrinhos e comprovantes, desejos e configurações.</p>
        <p className={`m-0 mt-2 text-sm font-bold ${diasSemBackup === null || diasSemBackup > 7 ? 'text-alerta-texto' : 'text-ok-texto'}`} data-testid="ultimo-backup">
          {ultimo ? `Último backup: ${formatarData(dataLocalDeInstante(ultimo))}${diasSemBackup! > 7 ? ` (há ${diasSemBackup} dias — faça um novo)` : ''}` : 'Você ainda não fez nenhum backup.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-fundo p-4">
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
          <input id="backup-com-senha" type="checkbox" checked={comSenha} onChange={(e) => setComSenha(e.target.checked)} className="h-6 w-6 accent-primaria" />Proteger o arquivo com senha
        </label>
        {comSenha && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><label htmlFor="backup-senha1" className="text-sm font-bold">Senha (mín. 6 caracteres)</label><input id="backup-senha1" type="password" autoComplete="new-password" value={senha1} onChange={(e) => setSenha1(e.target.value)} className={ENTRADA} /></div>
            <div className="flex flex-col gap-1"><label htmlFor="backup-senha2" className="text-sm font-bold">Repita a senha</label><input id="backup-senha2" type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} className={ENTRADA} /></div>
            <p className="m-0 text-xs text-suave sm:col-span-2">Sem a senha, ninguém abre o arquivo — nem você. Anote num lugar seguro.</p>
          </div>
        )}
        {erroExportar && <p role="alert" className="m-0 text-sm font-bold text-perigo-texto">{erroExportar}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={baixar} disabled={gerando} className="flex min-h-12 items-center gap-2 rounded-xl bg-primaria px-4 font-extrabold text-white disabled:opacity-60"><Download size={18} aria-hidden="true" />{gerando ? 'Preparando…' : 'Baixar backup'}</button>
          <button type="button" onClick={baixarPlanilha} className="min-h-12 rounded-xl border border-borda-forte bg-cartao px-4 font-bold text-tinta">Lançamentos em planilha (CSV)</button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-borda p-4">
        <h3 className="m-0 text-base font-extrabold">Restaurar de um backup</h3>
        <label htmlFor="backup-arquivo" className="inline-flex min-h-12 cursor-pointer items-center gap-2 self-start rounded-xl border-2 border-dashed border-primaria bg-primaria-clara px-4 font-extrabold text-primaria-escura focus-within:outline focus-within:outline-3 focus-within:outline-primaria">
          <Upload size={18} aria-hidden="true" />Escolher arquivo de backup
          <input id="backup-arquivo" type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void escolherArquivo(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {pedeSenha && textoArquivo && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void conferir(textoArquivo, senhaArquivo); }}>
            <div className="flex min-w-0 flex-1 flex-col gap-1"><label htmlFor="backup-senha-arquivo" className="text-sm font-bold">Este backup tem senha</label><input id="backup-senha-arquivo" type="password" value={senhaArquivo} onChange={(e) => setSenhaArquivo(e.target.value)} className={ENTRADA} /></div>
            <button type="submit" className="min-h-12 rounded-xl bg-primaria px-4 font-extrabold text-white">Abrir</button>
          </form>
        )}
        {erroImportar && <p role="alert" className="m-0 rounded-xl bg-perigo-fundo p-3 text-sm font-bold text-perigo-texto" data-testid="erro-backup">{erroImportar}</p>}
        {resumo && (
          <div className="flex flex-col gap-3" data-testid="resumo-backup">
            <p className="m-0 text-sm">Backup de <strong>{resumo.criadoEm ? formatarDataHora(resumo.criadoEm) : 'data desconhecida'}</strong>, com:</p>
            <ul className="m-0 grid grid-cols-1 gap-1 pl-5 text-sm sm:grid-cols-2">{resumo.contagens.map((c) => <li key={c.nome}>{c.quantidade} {c.nome}</li>)}</ul>
            <label className="flex min-h-12 items-start gap-3 rounded-xl border-2 border-status-alerta bg-alerta-fundo p-3 text-sm text-alerta-texto">
              <input id="backup-entendi" type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-primaria" />
              <span><strong>Entendo que os dados atuais deste aparelho serão substituídos pelos do backup.</strong> A chave Pix não vem no backup: cadastre e teste de novo depois.</span>
            </label>
            <button type="button" onClick={restaurar} disabled={!entendi || restaurando} className="min-h-12 self-start rounded-xl bg-perigo px-4 font-extrabold text-white disabled:opacity-50">{restaurando ? 'Restaurando…' : 'Restaurar backup'}</button>
          </div>
        )}
      </div>
    </section>
  );
}
