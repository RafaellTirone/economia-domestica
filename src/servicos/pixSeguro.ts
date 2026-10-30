import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
import { abrirCofre, fecharNoCofre, PinIncorreto, type Cofre } from './cofre';
import { mascararChave, type TipoChave } from './pix';

// Chave Pix da reserva, guardada criptografada e lacrada (ver cofre.ts).
// Fora do cofre fica só o que aparece na tela sem PIN: o tipo, a chave mascarada e o histórico.

export interface DadosPix {
  tipo: TipoChave;
  chave: string;
  /** Nome do titular como aparece no banco (o seu nome). */
  titular: string;
  banco: string;
  cidade: string;
  /** Passou no teste de R$ 0,01 (a pessoa confirmou que caiu na conta dela). */
  verificada: boolean;
  verificadaEm: string | null;
}

export interface RegistroPix {
  cofre: Cofre;
  tipo: TipoChave;
  mascara: string;
  historico: { evento: string; em: string }[];
  falhas: number;
  bloqueadoAte: string | null;
}

const CHAVE = 'pix-reserva';
const MAX_TENTATIVAS = 5;

export async function lerRegistroPix(): Promise<RegistroPix | null> {
  return ((await banco.configuracoes.get(CHAVE))?.valor as RegistroPix | undefined) ?? null;
}

export function useRegistroPix() {
  return useLiveQuery(lerRegistroPix, []);
}

/** Guarda (ou troca) a chave Pix no cofre. Registra o evento no histórico visível. */
export async function salvarChavePix(pin: string, dados: DadosPix, evento: string, iteracoes?: number): Promise<void> {
  const anterior = await lerRegistroPix();
  const cofre = await fecharNoCofre(pin, dados, iteracoes);
  const registro: RegistroPix = {
    cofre, tipo: dados.tipo, mascara: mascararChave(dados.tipo, dados.chave),
    historico: [...(anterior?.historico ?? []), { evento, em: new Date().toISOString() }].slice(-20),
    falhas: 0, bloqueadoAte: null,
  };
  await banco.configuracoes.put({ chave: CHAVE, valor: registro });
}

export class Bloqueado extends Error {
  constructor(public ate: Date) { super('Muitas tentativas. Aguarde.'); }
}

/**
 * Abre a chave Pix com o PIN. Depois de 5 PINs errados, bloqueia por um tempo que dobra a cada erro.
 * PIN errado OU chave adulterada → PinIncorreto (o app nunca gera Pix com dados que não passaram no lacre).
 */
export async function abrirChavePix(pin: string, agora = new Date()): Promise<DadosPix> {
  const r = await lerRegistroPix();
  if (!r) throw new Error('Nenhuma chave cadastrada.');
  if (r.bloqueadoAte && new Date(r.bloqueadoAte) > agora) throw new Bloqueado(new Date(r.bloqueadoAte));
  try {
    const dados = await abrirCofre<DadosPix>(pin, r.cofre);
    if (r.falhas) await banco.configuracoes.put({ chave: CHAVE, valor: { ...r, falhas: 0, bloqueadoAte: null } });
    return dados;
  } catch (e) {
    if (!(e instanceof PinIncorreto)) throw e;
    const falhas = r.falhas + 1;
    const bloqueadoAte = falhas >= MAX_TENTATIVAS ? new Date(agora.getTime() + 30_000 * 2 ** (falhas - MAX_TENTATIVAS)).toISOString() : null;
    await banco.configuracoes.put({ chave: CHAVE, valor: { ...r, falhas, bloqueadoAte } });
    throw e;
  }
}

/** Apaga só a chave Pix (ex.: esqueceu o PIN, ou o teste mostrou outro nome). Cofrinhos e lançamentos continuam. */
export async function apagarChavePix(): Promise<void> {
  await banco.configuracoes.delete(CHAVE);
}

export function tentativasRestantes(r: RegistroPix): number {
  return Math.max(0, MAX_TENTATIVAS - r.falhas);
}
