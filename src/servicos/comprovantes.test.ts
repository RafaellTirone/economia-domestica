import { describe, expect, it } from 'vitest';
import { formatarTamanho, novoTamanho, validarComprovante } from './comprovantes';

describe('comprovantes', () => {
  it('aceita foto e PDF', () => {
    expect(validarComprovante({ name: 'pix.jpg', type: 'image/jpeg', size: 300_000 })).toBeNull();
    expect(validarComprovante({ name: 'print.png', type: 'image/png', size: 300_000 })).toBeNull();
    expect(validarComprovante({ name: 'recibo.pdf', type: 'application/pdf', size: 300_000 })).toBeNull();
    expect(validarComprovante({ name: 'foto.HEIC', type: '', size: 300_000 })).toBeNull();
  });
  it('recusa outros tipos, arquivo vazio e acima de 15 MB', () => {
    expect(validarComprovante({ name: 'virus.exe', type: 'application/x-msdownload', size: 100 })).toContain('não é foto nem PDF');
    expect(validarComprovante({ name: 'pagina.html', type: 'text/html', size: 100 })).toContain('não é foto nem PDF');
    expect(validarComprovante({ name: 'grande.jpg', type: 'image/jpeg', size: 16 * 1024 * 1024 })).toContain('15 MB');
    expect(validarComprovante({ name: 'vazio.jpg', type: 'image/jpeg', size: 0 })).toContain('vazio');
  });
  it('reduz fotos grandes mantendo a proporção', () => {
    expect(novoTamanho(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(novoTamanho(1080, 2400)).toEqual({ largura: 720, altura: 1600 });
    expect(novoTamanho(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
  it('mostra o tamanho', () => {
    expect(formatarTamanho(350 * 1024)).toBe('350 KB');
    expect(formatarTamanho(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});
