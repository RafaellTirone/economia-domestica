import { useLiveQuery } from 'dexie-react-hooks';
import { banco, converterFixasAntigas } from '../db/banco';
import type { ArquivoGuardado, Configuracao } from '../tipos';
import { abrirCofre, fecharNoCofre, PinIncorreto, type Cofre } from './cofre';

// Backup (cópia de segurança): exporta TUDO num arquivo e restaura depois, em outro aparelho
// ou depois de limpar o navegador. O arquivo pode ser protegido por senha (AES-256).
// Ao restaurar, cada registro é conferido; arquivo estranho ou adulterado é recusado.
// Por segurança, a chave Pix NÃO vai no backup: depois de restaurar, cadastra e testa de novo.

export const APP = 'nosso-dinheiro';
export const FORMATO = 1;
const TABELAS = ['categorias', 'lancamentos', 'emprestimos', 'pagamentosParcela', 'arquivos', 'cofrinhos', 'movimentosCofrinho', 'desejos', 'recorrencias', 'configuracoes'] as const;
type Tabela = (typeof TABELAS)[number];
/** Configurações que viajam no backup (a chave Pix e o controle de tentativas ficam de fora). */
const CONFIGS_PERMITIDAS = new Set(['salario', 'preferencias-graficos']);

export type DadosBackup = Record<Tabela, Record<string, unknown>[]>;
export interface ArquivoBackup { app: typeof APP; formato: number; criadoEm: string; dados: DadosBackup }
export interface ArquivoBackupProtegido { app: typeof APP; formato: number; criadoEm: string; protegido: true; cofre: Cofre }

const NOMES: Record<Tabela, string> = {
  categorias: 'categorias', lancamentos: 'lançamentos', emprestimos: 'empréstimos', pagamentosParcela: 'pagamentos de parcelas',
  arquivos: 'arquivos (contratos e comprovantes)', cofrinhos: 'cofrinhos', movimentosCofrinho: 'depósitos e saques', desejos: 'desejos', recorrencias: 'contas que se repetem', configuracoes: 'configurações',
};

// ---------- Blob <-> texto ----------
async function blobParaBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ParaBlob(b64: string, tipo: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** Junta todos os dados do aparelho num objeto de backup. */
export async function montarBackup(): Promise<ArquivoBackup> {
  const dados = {} as DadosBackup;
  for (const t of TABELAS) {
    const linhas = (await (banco[t] as unknown as { toArray(): Promise<Record<string, unknown>[]> }).toArray());
    if (t === 'arquivos') {
      dados.arquivos = await Promise.all((linhas as unknown as ArquivoGuardado[]).map(async (a) => ({ ...a, dados: await blobParaBase64(a.dados) })));
    } else if (t === 'configuracoes') {
      dados.configuracoes = (linhas as unknown as Configuracao[]).filter((c) => CONFIGS_PERMITIDAS.has(c.chave)) as unknown as Record<string, unknown>[];
    } else dados[t] = linhas;
  }
  return { app: APP, formato: FORMATO, criadoEm: new Date().toISOString(), dados };
}

/** Texto do arquivo de backup (com ou sem senha). */
export async function gerarArquivoBackup(senha?: string, iteracoes?: number): Promise<string> {
  const backup = await montarBackup();
  if (!senha) return JSON.stringify(backup);
  const protegido: ArquivoBackupProtegido = { app: APP, formato: FORMATO, criadoEm: backup.criadoEm, protegido: true, cofre: await fecharNoCofre(senha, backup.dados, iteracoes) };
  return JSON.stringify(protegido);
}

export async function registrarBackupFeito(): Promise<void> {
  await banco.configuracoes.put({ chave: 'ultimo-backup', valor: new Date().toISOString() });
}

/** Data do último backup (null = nunca). */
export function useUltimoBackup() {
  return useLiveQuery(async () => ((await banco.configuracoes.get('ultimo-backup'))?.valor as string | undefined) ?? null, []);
}

// ---------- Leitura e conferência ----------

export class BackupInvalido extends Error {}
export class PrecisaSenha extends Error {}

const ehISO = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ehInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v);
const ehTexto = (v: unknown, max = 500) => typeof v === 'string' && v.length <= max;
const umDe = (v: unknown, op: readonly unknown[]) => op.includes(v);
const opcional = (v: unknown, f: (x: unknown) => boolean) => v === undefined || v === null || f(v);

/** Regras mínimas de cada registro: protege contra arquivo corrompido ou adulterado. */
const REGRAS: Record<Tabela, (r: Record<string, unknown>) => boolean> = {
  categorias: (r) => ehInt(r.id) && ehTexto(r.nome, 60) && typeof r.cor === 'string' && /^#[0-9a-f]{6}$/i.test(r.cor) && ehTexto(r.icone, 30)
    && umDe(r.tipo, ['despesa', 'receita']) && Array.isArray(r.subcategorias) && (r.subcategorias as unknown[]).every((s) => !!s && ehTexto((s as Record<string, unknown>).id, 80) && ehTexto((s as Record<string, unknown>).nome, 80))
    && opcional(r.limiteMensal, ehInt) && ehInt(r.ordem),
  lancamentos: (r) => ehInt(r.id) && umDe(r.tipo, ['despesa', 'receita', 'guardado']) && ehISO(r.data) && ehTexto(r.descricao, 200) && ehInt(r.valor)
    && ehInt(r.categoriaId) && umDe(r.forma, ['dinheiro', 'pix', 'debito', 'credito']) && umDe(r.situacao, ['pago', 'a_pagar']) && opcional(r.observacao, (x) => ehTexto(x, 1000)) && opcional(r.recorrenciaId, (x) => ehTexto(x, 40)),
  emprestimos: (r) => ehInt(r.id) && ehTexto(r.nome, 100) && ehInt(r.valorEmprestado) && ehInt(r.numeroParcelas) && (r.numeroParcelas as number) >= 1 && (r.numeroParcelas as number) <= 600
    && ehInt(r.valorParcela) && ehISO(r.dataPrimeiraParcela) && umDe(r.sistema, ['price', 'sac']) && typeof r.multaAtraso === 'number' && typeof r.jurosMora === 'number',
  pagamentosParcela: (r) => ehInt(r.id) && ehInt(r.emprestimoId) && ehInt(r.numeroParcela) && ehISO(r.dataPagamento) && ehInt(r.valorPago),
  arquivos: (r) => ehInt(r.id) && ehTexto(r.nome, 255) && typeof r.tipo === 'string' && /^(application\/pdf|image\/[a-z+.-]+)$/i.test(r.tipo) && typeof r.dados === 'string' && /^[A-Za-z0-9+/=]*$/.test(r.dados) && r.dados.length < 40_000_000,
  cofrinhos: (r) => ehInt(r.id) && ehTexto(r.nome, 100) && ehInt(r.meta) && opcional(r.prazo, ehISO) && opcional(r.depositoMensal, ehInt),
  movimentosCofrinho: (r) => ehInt(r.id) && ehInt(r.cofrinhoId) && umDe(r.tipo, ['deposito', 'saque']) && ehInt(r.valor) && ehISO(r.data) && opcional(r.comprovantes, (x) => Array.isArray(x) && x.every(ehInt)),
  desejos: (r) => ehInt(r.id) && ehTexto(r.nome, 100) && ehInt(r.precoVista) && umDe(r.prioridade, ['alta', 'media', 'baixa']),
  recorrencias: (r) => ehInt(r.id) && umDe(r.tipo, ['despesa', 'receita']) && ehTexto(r.descricao, 200) && ehInt(r.valor) && ehInt(r.categoriaId)
    && umDe(r.forma, ['dinheiro', 'pix', 'debito', 'credito']) && ehInt(r.dia) && (r.dia as number) >= 1 && (r.dia as number) <= 31
    && typeof r.inicio === 'string' && /^\d{4}-\d{2}$/.test(r.inicio) && opcional(r.fim, (x) => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x))
    && Array.isArray(r.pulados) && (r.pulados as unknown[]).every((m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)),
  configuracoes: (r) => typeof r.chave === 'string' && CONFIGS_PERMITIDAS.has(r.chave),
};

export interface ResumoBackup { criadoEm: string; contagens: { nome: string; quantidade: number }[]; dados: DadosBackup }

/** Lê e confere um arquivo de backup. Lança PrecisaSenha, PinIncorreto (senha errada) ou BackupInvalido. */
export async function lerArquivoBackup(texto: string, senha?: string): Promise<ResumoBackup> {
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(texto); } catch { throw new BackupInvalido('Este arquivo não é um backup do app (não deu para ler).'); }
  if (!obj || obj.app !== APP) throw new BackupInvalido('Este arquivo não é um backup do Nosso Dinheiro.');
  if (typeof obj.formato !== 'number' || obj.formato > FORMATO) throw new BackupInvalido('Este backup foi feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  let dados: DadosBackup;
  if (obj.protegido) {
    if (!senha) throw new PrecisaSenha('Este backup é protegido por senha.');
    dados = await abrirCofre<DadosBackup>(senha, obj.cofre as Cofre); // senha errada → PinIncorreto
  } else dados = obj.dados as DadosBackup;
  if (!dados || typeof dados !== 'object') throw new BackupInvalido('O backup está vazio ou danificado.');
  for (const t of TABELAS) {
    const linhas = dados[t] ?? [];
    if (!Array.isArray(linhas)) throw new BackupInvalido(`O backup está danificado (${NOMES[t]}).`);
    const ruim = linhas.findIndex((r) => !r || typeof r !== 'object' || !REGRAS[t](r));
    if (ruim >= 0) throw new BackupInvalido(`O backup tem dados inválidos em ${NOMES[t]} (registro ${ruim + 1}). Nada foi alterado.`);
    dados[t] = linhas;
  }
  if (!dados.categorias.length) throw new BackupInvalido('O backup não tem categorias: parece incompleto. Nada foi alterado.');
  return {
    criadoEm: typeof obj.criadoEm === 'string' ? obj.criadoEm : '',
    contagens: TABELAS.filter((t) => t !== 'configuracoes').map((t) => ({ nome: NOMES[t], quantidade: dados[t].length })),
    dados,
  };
}

/** Substitui TODOS os dados do aparelho pelos do backup (em uma única transação: ou tudo, ou nada). */
export async function restaurarBackup(dados: DadosBackup): Promise<void> {
  const tabelas = TABELAS.map((t) => banco[t]);
  await banco.transaction('rw', tabelas, async () => {
    for (const t of TABELAS) {
      const tabela = banco[t] as unknown as { clear(): Promise<void>; bulkPut(l: unknown[]): Promise<unknown>; where(k: string): { anyOf(v: string[]): { delete(): Promise<number> } } };
      if (t === 'configuracoes') {
        // mantém a chave Pix fora; só substitui as configurações que viajam no backup
        await tabela.where('chave').anyOf([...CONFIGS_PERMITIDAS]).delete();
        await tabela.bulkPut(dados.configuracoes);
        continue;
      }
      await tabela.clear();
      const linhas = t === 'arquivos'
        ? dados.arquivos.map((a) => ({ ...a, dados: base64ParaBlob(a.dados as string, a.tipo as string) }))
        : dados[t];
      await tabela.bulkPut(linhas);
    }
    // Backup antigo (antes das contas que se repetem): as despesas "fixa" ganham repetição
    await converterFixasAntigas(banco.lancamentos, banco.recorrencias);
    // Chave Pix e tentativas de PIN não vêm do backup: cadastra e testa de novo
    await banco.configuracoes.delete('pix-reserva');
  });
}

export { PinIncorreto as SenhaIncorreta };
