import type { Centavos } from '../tipos';

// Pix "copia e cola" (BR Code) gerado DENTRO do aparelho, no padrão do Banco Central.
// O app nunca movimenta dinheiro: ele só monta o código para a pessoa pagar no app do banco,
// de uma conta dela para outra conta dela (o cofrinho).

export type TipoChave = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';

export const NOMES_TIPO_CHAVE: Record<TipoChave, string> = { cpf: 'CPF', cnpj: 'CNPJ', telefone: 'Celular', email: 'E-mail', aleatoria: 'Chave aleatória' };

const soDigitos = (t: string) => t.replace(/\D/g, '');

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(cpf[9]) && dig(10) === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dig = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(cnpj[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(12) === Number(cnpj[12]) && dig(13) === Number(cnpj[13]);
}

/**
 * Confere e normaliza a chave Pix. Devolve a chave no formato oficial ou uma mensagem de erro.
 * CPF/CNPJ: confere os dígitos verificadores (um número digitado errado é recusado na hora).
 */
export function validarChave(tipo: TipoChave, texto: string): { chave: string } | { erro: string } {
  const t = texto.trim();
  switch (tipo) {
    case 'cpf': { const d = soDigitos(t); return cpfValido(d) ? { chave: d } : { erro: 'CPF inválido. Confira os números.' }; }
    case 'cnpj': { const d = soDigitos(t); return cnpjValido(d) ? { chave: d } : { erro: 'CNPJ inválido. Confira os números.' }; }
    case 'telefone': {
      let d = soDigitos(t);
      if (d.length === 11) d = `55${d}`;
      return /^55\d{2}9\d{8}$/.test(d) ? { chave: `+${d}` } : { erro: 'Celular inválido. Use DDD + número, ex.: (11) 91234-5678.' };
    }
    case 'email': {
      const e = t.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 77 ? { chave: e } : { erro: 'E-mail inválido.' };
    }
    case 'aleatoria': {
      const a = t.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a) ? { chave: a } : { erro: 'Chave aleatória inválida (são 32 letras e números com hífens).' };
    }
  }
}

/** Mostra só parte da chave: ***.456.789-** */
export function mascararChave(tipo: TipoChave, chave: string): string {
  if (tipo === 'cpf') return `***.${chave.slice(3, 6)}.${chave.slice(6, 9)}-**`;
  if (tipo === 'cnpj') return `**.${chave.slice(2, 5)}.${chave.slice(5, 8)}/****-**`;
  if (tipo === 'telefone') return `(${chave.slice(3, 5)}) *****-${chave.slice(-4)}`;
  if (tipo === 'email') { const [u, d] = chave.split('@'); return `${u.slice(0, 2)}***@${d}`; }
  return `${chave.slice(0, 8)}-****-****-****-********${chave.slice(-4)}`;
}

/** Nome/cidade no formato aceito pelo Pix: sem acentos, maiúsculas, tamanho máximo. */
export function textoPix(t: string, max: number): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido pelo padrão BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const campo = (id: string, valor: string) => `${id}${String(new TextEncoder().encode(valor).length).padStart(2, '0')}${valor}`;

/** Monta o Pix copia e cola (estático) com chave, valor, nome do titular e cidade. */
export function gerarBRCode(d: { chave: string; valor: Centavos; titular: string; cidade: string }): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', d.chave);
  const corpo = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
    + campo('54', (d.valor / 100).toFixed(2)) + campo('58', 'BR')
    + campo('59', textoPix(d.titular, 25) || 'TITULAR') + campo('60', textoPix(d.cidade, 15) || 'BRASIL')
    + campo('62', campo('05', '***')) + '6304';
  return corpo + crc16(corpo);
}

/** Lê um Pix copia e cola e confere o CRC. Usado para conferir o código ANTES de mostrar. */
export function lerBRCode(codigo: string): { chave: string; valor: Centavos | null; titular: string; cidade: string } | null {
  if (codigo.length < 8 || crc16(codigo.slice(0, -4)) !== codigo.slice(-4)) return null;
  const ler = (t: string) => {
    const mapa = new Map<string, string>();
    let i = 0;
    while (i + 4 <= t.length) {
      const id = t.slice(i, i + 2);
      const tam = Number(t.slice(i + 2, i + 4));
      if (!Number.isFinite(tam)) return null;
      mapa.set(id, t.slice(i + 4, i + 4 + tam));
      i += 4 + tam;
    }
    return mapa;
  };
  const raiz = ler(codigo);
  const conta = raiz && ler(raiz.get('26') ?? '');
  if (!raiz || !conta || conta.get('00') !== 'br.gov.bcb.pix') return null;
  const valor = raiz.get('54');
  return { chave: conta.get('01') ?? '', valor: valor ? Math.round(Number(valor) * 100) : null, titular: raiz.get('59') ?? '', cidade: raiz.get('60') ?? '' };
}

// ---------- Selo visual ----------
// Cada chave gera sempre os mesmos 3 símbolos. Se um dia aparecer outra combinação, a chave mudou.

export const FORMAS = ['triângulo', 'círculo', 'quadrado', 'losango', 'estrela', 'hexágono'] as const;
export const CORES_SELO = [
  { nome: 'azul', hex: '#2a78d6' }, { nome: 'laranja', hex: '#eb6834' }, { nome: 'verde', hex: '#1baf7a' },
  { nome: 'amarelo', hex: '#eda100' }, { nome: 'rosa', hex: '#e87ba4' }, { nome: 'roxo', hex: '#6250d6' },
] as const;

export interface SimboloSelo { forma: (typeof FORMAS)[number]; cor: (typeof CORES_SELO)[number] }

export async function seloDaChave(chave: string): Promise<SimboloSelo[]> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`selo-v1:${chave}`)));
  return [0, 1, 2].map((i) => ({ forma: FORMAS[hash[i * 2] % FORMAS.length], cor: CORES_SELO[hash[i * 2 + 1] % CORES_SELO.length] }));
}
