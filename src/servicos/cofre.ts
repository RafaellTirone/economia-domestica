// Cofre criptografado para a chave Pix: protegida por um PIN que só a pessoa sabe.
// - A chave do cofre é derivada do PIN (PBKDF2-SHA256, 600 mil repetições: tentar PINs fica lento).
// - Os dados são cifrados com AES-256-GCM (quem copiar os arquivos do navegador não consegue ler).
// - Um "lacre" (HMAC-SHA256) confere que nada foi alterado: se alguém mexer, o app bloqueia.
// O PIN nunca é guardado.

export interface Cofre {
  versao: 1;
  iteracoes: number;
  sal: string;
  iv: string;
  cifrado: string;
  lacre: string;
}

export class PinIncorreto extends Error {
  constructor() { super('PIN incorreto ou dados alterados.'); }
}

const ITERACOES = 600_000;
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivarChaves(pin: string, sal: Uint8Array, iteracoes: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base, 512));
  const cifra = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const lacre = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return { cifra, lacre };
}

const conteudoDoLacre = (c: Pick<Cofre, 'versao' | 'iteracoes' | 'sal' | 'iv' | 'cifrado'>) => new TextEncoder().encode(`${c.versao}|${c.iteracoes}|${c.sal}|${c.iv}|${c.cifrado}`);

/** Cria o cofre com os dados (ex.: a chave Pix) protegidos pelo PIN. */
export async function fecharNoCofre<T>(pin: string, dados: T, iteracoes = ITERACOES): Promise<Cofre> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { cifra, lacre } = await derivarChaves(pin, sal, iteracoes);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cifra, new TextEncoder().encode(JSON.stringify(dados)));
  const base = { versao: 1 as const, iteracoes, sal: b64(sal), iv: b64(iv), cifrado: b64(cifrado) };
  return { ...base, lacre: b64(await crypto.subtle.sign('HMAC', lacre, conteudoDoLacre(base))) };
}

/** Abre o cofre. Confere o lacre antes de decifrar: PIN errado ou dados alterados → PinIncorreto. */
export async function abrirCofre<T>(pin: string, cofre: Cofre): Promise<T> {
  try {
    const { cifra, lacre } = await derivarChaves(pin, deB64(cofre.sal), cofre.iteracoes);
    const ok = await crypto.subtle.verify('HMAC', lacre, deB64(cofre.lacre), conteudoDoLacre(cofre));
    if (!ok) throw new PinIncorreto();
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(cofre.iv) }, cifra, deB64(cofre.cifrado));
    return JSON.parse(new TextDecoder().decode(claro)) as T;
  } catch (e) {
    if (e instanceof PinIncorreto) throw e;
    throw new PinIncorreto();
  }
}

/** PIN aceito: 6 dígitos, sem sequências óbvias. */
export function validarPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'O PIN tem 6 números.';
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Escolha um PIN menos óbvio (sem 111111 ou 123456).';
  return null;
}
