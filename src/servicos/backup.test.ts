import { beforeEach, describe, expect, it } from 'vitest';
import { banco } from '../db/banco';
import { BackupInvalido, gerarArquivoBackup, lerArquivoBackup, PrecisaSenha, restaurarBackup, SenhaIncorreta } from './backup';

async function limparTudo() {
  await banco.delete();
  await banco.open();
}

beforeEach(limparTudo);

async function popular() {
  await banco.lancamentos.add({ tipo: 'despesa', data: '2026-10-28', descricao: 'Padaria', valor: 1850, categoriaId: 2, forma: 'debito', fixa: false, situacao: 'pago', criadoEm: '' });
  const arquivoId = await banco.arquivos.add({ nome: 'recibo.pdf', tipo: 'application/pdf', tamanho: 8, dados: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), criadoEm: '' });
  const cofrinhoId = await banco.cofrinhos.add({ nome: 'Reserva', meta: 500000, prazo: null, ondeGuarda: 'cdb', rendimentoMensal: null, depositoMensal: null, criadoEm: '' });
  await banco.movimentosCofrinho.add({ cofrinhoId, tipo: 'deposito', valor: 50000, data: '2026-10-01', via: 'pix', lancamentoId: null, comprovantes: [arquivoId] });
  await banco.configuracoes.put({ chave: 'salario', valor: { tipo: 'dia', dia: 5 } });
  await banco.configuracoes.put({ chave: 'pix-reserva', valor: { segredo: 'cofre' } });
}

describe('backup', () => {
  it('exporta e restaura tudo (inclusive arquivos), sem levar a chave Pix', async () => {
    await popular();
    const texto = await gerarArquivoBackup();
    expect(texto).not.toContain('pix-reserva');
    await limparTudo();
    expect(await banco.lancamentos.count()).toBe(0);
    const resumo = await lerArquivoBackup(texto);
    expect(resumo.contagens.find((c) => c.nome === 'lançamentos')!.quantidade).toBe(1);
    await restaurarBackup(resumo.dados);
    expect((await banco.lancamentos.toArray())[0]).toMatchObject({ descricao: 'Padaria', valor: 1850 });
    const arq = (await banco.arquivos.toArray())[0];
    expect(await arq.dados.text()).toBe('%PDF-1.4');
    expect((await banco.movimentosCofrinho.toArray())[0].comprovantes).toEqual([arq.id]);
    expect((await banco.configuracoes.get('salario'))?.valor).toEqual({ tipo: 'dia', dia: 5 });
    expect(await banco.configuracoes.get('pix-reserva')).toBeUndefined();
    expect(await banco.categorias.count()).toBe(14);
  });
  it('backup com senha: pede a senha e recusa a errada', async () => {
    await popular();
    const texto = await gerarArquivoBackup('minha senha forte', 1000);
    expect(texto).not.toContain('Padaria');
    await expect(lerArquivoBackup(texto)).rejects.toBeInstanceOf(PrecisaSenha);
    await expect(lerArquivoBackup(texto, 'errada')).rejects.toBeInstanceOf(SenhaIncorreta);
    expect((await lerArquivoBackup(texto, 'minha senha forte')).contagens[1].quantidade).toBe(1);
  });
  it('recusa arquivo que não é backup, adulterado ou de versão mais nova', async () => {
    await expect(lerArquivoBackup('isto não é json')).rejects.toBeInstanceOf(BackupInvalido);
    await expect(lerArquivoBackup('{"app":"outro"}')).rejects.toBeInstanceOf(BackupInvalido);
    await popular();
    const ok = JSON.parse(await gerarArquivoBackup());
    await expect(lerArquivoBackup(JSON.stringify({ ...ok, formato: 99 }))).rejects.toThrow(/versão mais nova/);
    const adulterado = structuredClone(ok);
    adulterado.dados.lancamentos[0].valor = 'R$ 1000000';
    await expect(lerArquivoBackup(JSON.stringify(adulterado))).rejects.toThrow(/inválidos em lançamentos/);
    const script = structuredClone(ok);
    script.dados.arquivos[0].tipo = 'text/html';
    await expect(lerArquivoBackup(JSON.stringify(script))).rejects.toThrow(/inválidos em arquivos/);
    const pix = structuredClone(ok);
    pix.dados.configuracoes.push({ chave: 'pix-reserva', valor: { golpe: true } });
    await expect(lerArquivoBackup(JSON.stringify(pix))).rejects.toThrow(/configurações/);
  });
  it('arquivo recusado não altera nada', async () => {
    await popular();
    await expect(lerArquivoBackup('{"app":"nosso-dinheiro","formato":1,"dados":{"categorias":[]}}')).rejects.toBeInstanceOf(BackupInvalido);
    expect(await banco.lancamentos.count()).toBe(1);
  });
});
