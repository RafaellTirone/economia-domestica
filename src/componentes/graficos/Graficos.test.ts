import { describe, expect, it } from 'vitest';
import { agruparFatias } from './Graficos';

describe('pizza: no máximo 8 fatias', () => {
  const dez = Array.from({ length: 10 }, (_, i) => ({ rotulo: `C${i}`, valor: (10 - i) * 100, cor: '#000' }));
  it('junta o que passar de 7 em "Outras"', () => {
    const f = agruparFatias(dez);
    expect(f).toHaveLength(8);
    expect(f[7]).toMatchObject({ rotulo: 'Outras (3)', valor: 300 + 200 + 100 });
    expect(f.reduce((s, x) => s + x.valor, 0)).toBe(dez.reduce((s, x) => s + x.valor, 0));
  });
  it('até 8 fica como está', () => {
    expect(agruparFatias(dez.slice(0, 8))).toHaveLength(8);
  });
});
