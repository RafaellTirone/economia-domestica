import { describe, expect, it } from 'vitest';
import { abrirCofre, fecharNoCofre, PinIncorreto, validarPin } from './cofre';
import { crc16, gerarBRCode, lerBRCode, mascararChave, seloDaChave, validarChave } from './pix';

describe('Pix: código no padrão do Banco Central', () => {
  it('CRC16 confere com o exemplo oficial do manual do BR Code', () => {
    const exemplo = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(exemplo)).toBe('1D3D');
  });
  it('gera e lê de volta (chave, valor, nome e cidade conferem)', () => {
    const codigo = gerarBRCode({ chave: '12345678909', valor: 500_00, titular: 'José da Silva Ção', cidade: 'São Paulo' });
    expect(codigo).toContain('br.gov.bcb.pix');
    expect(codigo).toContain('5406500.00');
    expect(lerBRCode(codigo)).toEqual({ chave: '12345678909', valor: 500_00, titular: 'JOSE DA SILVA CAO', cidade: 'SAO PAULO' });
  });
  it('código adulterado é recusado (CRC não confere)', () => {
    const codigo = gerarBRCode({ chave: '12345678909', valor: 500_00, titular: 'Ana', cidade: 'Recife' });
    expect(lerBRCode(codigo.replace('12345678909', '98765432100'))).toBeNull();
  });
});

describe('Pix: validação da chave', () => {
  it('CPF com dígito verificador', () => {
    expect(validarChave('cpf', '123.456.789-09')).toEqual({ chave: '12345678909' });
    expect(validarChave('cpf', '123.456.789-00')).toHaveProperty('erro');
    expect(validarChave('cpf', '111.111.111-11')).toHaveProperty('erro');
  });
  it('CNPJ, celular, e-mail e chave aleatória', () => {
    expect(validarChave('cnpj', '11.222.333/0001-81')).toEqual({ chave: '11222333000181' });
    expect(validarChave('telefone', '(11) 91234-5678')).toEqual({ chave: '+5511912345678' });
    expect(validarChave('telefone', '1234')).toHaveProperty('erro');
    expect(validarChave('email', ' Fulano@Email.com ')).toEqual({ chave: 'fulano@email.com' });
    expect(validarChave('aleatoria', '123E4567-E12B-12D1-A456-426655440000')).toEqual({ chave: '123e4567-e12b-12d1-a456-426655440000' });
  });
  it('mascara a chave na tela', () => {
    expect(mascararChave('cpf', '12345678909')).toBe('***.456.789-**');
    expect(mascararChave('telefone', '+5511912345678')).toBe('(11) *****-5678');
  });
  it('selo visual: mesma chave → mesmos símbolos; outra chave → outros', async () => {
    const a = await seloDaChave('12345678909');
    expect(await seloDaChave('12345678909')).toEqual(a);
    expect(await seloDaChave('98765432100')).not.toEqual(a);
    expect(a).toHaveLength(3);
  });
});

describe('cofre protegido por PIN', () => {
  const dados = { chave: '12345678909', titular: 'Ana' };
  it('abre com o PIN certo', async () => {
    const cofre = await fecharNoCofre('482916', dados, 1000);
    expect(await abrirCofre('482916', cofre)).toEqual(dados);
    expect(cofre.cifrado).not.toContain('12345678909');
  });
  it('PIN errado é recusado', async () => {
    const cofre = await fecharNoCofre('482916', dados, 1000);
    await expect(abrirCofre('000001', cofre)).rejects.toBeInstanceOf(PinIncorreto);
  });
  it('dados adulterados são detectados pelo lacre', async () => {
    const cofre = await fecharNoCofre('482916', dados, 1000);
    const outro = await fecharNoCofre('482916', { chave: '98765432100', titular: 'Golpista' }, 1000);
    await expect(abrirCofre('482916', { ...cofre, cifrado: outro.cifrado })).rejects.toBeInstanceOf(PinIncorreto);
  });
  it('PIN fraco é recusado', () => {
    expect(validarPin('123456')).toBeTruthy();
    expect(validarPin('111111')).toBeTruthy();
    expect(validarPin('12a456')).toBeTruthy();
    expect(validarPin('482916')).toBeNull();
  });
});
