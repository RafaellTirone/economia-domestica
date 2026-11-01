// Auditoria do backup: baixar (com e sem senha) num aparelho, restaurar num aparelho novo,
// recusar senha errada e arquivo adulterado, e não trazer a chave Pix.
// Uso: npm run build && npm run test:e2e
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4186);
const navegador = await playwright.chromium.launch();
const opcoes = { viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, acceptDownloads: true };
const erros = [];
const vigiar = (p) => { p.on('console', (m) => m.type() === 'error' && erros.push(m.text())); p.on('pageerror', (e) => erros.push(e.message)); };
const hojeBR = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })();

// ===== Aparelho 1: dados + backup =====
const ctx1 = await navegador.newContext(opcoes);
const p1 = await ctx1.newPage();
vigiar(p1);
await p1.goto(URL_APP);
await p1.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
await p1.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => {
    const tx = req.result.transaction(['lancamentos', 'cofrinhos', 'movimentosCofrinho', 'arquivos', 'configuracoes'], 'readwrite');
    tx.objectStore('lancamentos').add({ tipo: 'despesa', data: '2026-10-28', descricao: 'Padaria do bairro', valor: 1850, categoriaId: 2, forma: 'debito', fixa: false, situacao: 'pago', criadoEm: '' });
    tx.objectStore('arquivos').add({ nome: 'comprovante.pdf', tipo: 'application/pdf', tamanho: 8, dados: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), criadoEm: '' });
    tx.objectStore('cofrinhos').add({ nome: 'Reserva de emergência', meta: 500000, prazo: null, ondeGuarda: 'cdb', rendimentoMensal: null, depositoMensal: null, criadoEm: '' });
    tx.objectStore('movimentosCofrinho').add({ cofrinhoId: 1, tipo: 'deposito', valor: 50000, data: '2026-10-01', via: 'pix', lancamentoId: null, comprovantes: [1] });
    tx.objectStore('configuracoes').put({ chave: 'salario', valor: { tipo: 'dia', dia: 5 } });
    tx.objectStore('configuracoes').put({ chave: 'pix-reserva', valor: { cofre: 'segredo', tipo: 'cpf', mascara: '***', historico: [], falhas: 0, bloqueadoAte: null } });
    tx.oncomplete = () => { req.result.close(); ok(); };
  };
}));
await p1.goto(`${URL_APP}/configuracoes`);
await p1.getByTestId('ultimo-backup').waitFor();
confere('Configurações avisa que ainda não há backup', (await p1.getByTestId('ultimo-backup').innerText()).includes('ainda não fez nenhum backup'));
await verificarTela(p1, 'Backup · celular');
const [d1] = await Promise.all([p1.waitForEvent('download'), p1.getByRole('button', { name: 'Baixar backup' }).click()]);
const arqSimples = join(CAPTURAS, '..', 'arquivos-teste', 'backup-simples.json');
await d1.saveAs(arqSimples);
const textoSimples = readFileSync(arqSimples, 'utf8');
confere('Backup baixado com nome e data', /^nosso-dinheiro-backup-\d{4}-\d{2}-\d{2}\.json$/.test(d1.suggestedFilename()), d1.suggestedFilename());
confere('Backup leva lançamentos, cofrinhos e o PDF', textoSimples.includes('Padaria do bairro') && textoSimples.includes('Reserva de emergência') && textoSimples.includes(Buffer.from('%PDF-1.4').toString('base64')));
confere('Backup NÃO leva a chave Pix', !textoSimples.includes('pix-reserva') && !textoSimples.includes('segredo'));
await p1.getByTestId('ultimo-backup').filter({ hasText: hojeBR }).waitFor({ timeout: 5000 }).catch(() => {});
confere(`Registra a data do último backup (${hojeBR})`, (await p1.getByTestId('ultimo-backup').innerText()).includes(hojeBR));
// com senha
await p1.locator('#backup-com-senha').check();
await p1.locator('#backup-senha1').fill('minhasenha');
await p1.locator('#backup-senha2').fill('outrasenha');
await p1.getByRole('button', { name: 'Baixar backup' }).click();
confere('Senhas diferentes: avisa e não baixa', await p1.getByText('As duas senhas não são iguais.').isVisible());
await p1.locator('#backup-senha2').fill('minhasenha');
const [d2] = await Promise.all([p1.waitForEvent('download'), p1.getByRole('button', { name: 'Baixar backup' }).click()]);
const arqSenha = join(CAPTURAS, '..', 'arquivos-teste', 'backup-com-senha.json');
await d2.saveAs(arqSenha);
confere('Backup com senha fica ilegível sem a senha', !readFileSync(arqSenha, 'utf8').includes('Padaria'));
// arquivo adulterado
const adulterado = JSON.parse(textoSimples);
adulterado.dados.lancamentos[0].valor = 'R$ 999';
const arqAdulterado = join(CAPTURAS, '..', 'arquivos-teste', 'backup-adulterado.json');
writeFileSync(arqAdulterado, JSON.stringify(adulterado));
await ctx1.close();

// ===== Aparelho 2: novo e vazio =====
const ctx2 = await navegador.newContext(opcoes);
const p2 = await ctx2.newPage();
vigiar(p2);
await p2.goto(`${URL_APP}/configuracoes`);
await p2.getByTestId('ultimo-backup').waitFor();
await p2.locator('#backup-arquivo').setInputFiles(arqAdulterado);
await p2.getByTestId('erro-backup').waitFor();
confere('Arquivo adulterado é recusado com explicação', (await p2.getByTestId('erro-backup').innerText()).includes('dados inválidos em lançamentos'));
await p2.locator('#backup-arquivo').setInputFiles({ name: 'foto.json', mimeType: 'application/json', buffer: Buffer.from('{"qualquer":"coisa"}') });
await p2.getByTestId('erro-backup').filter({ hasText: 'não é um backup' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Arquivo que não é backup é recusado', (await p2.getByTestId('erro-backup').innerText()).includes('não é um backup do Nosso Dinheiro'));
// com senha
await p2.locator('#backup-arquivo').setInputFiles(arqSenha);
await p2.locator('#backup-senha-arquivo').waitFor();
confere('Backup com senha: pede a senha', await p2.getByText('Este backup tem senha').isVisible());
await p2.locator('#backup-senha-arquivo').fill('errada123');
await p2.getByRole('button', { name: 'Abrir' }).click();
await p2.getByTestId('erro-backup').waitFor({ timeout: 15000 });
confere('Senha errada é recusada', (await p2.getByTestId('erro-backup').innerText()).includes('Senha incorreta'));
await p2.locator('#backup-senha-arquivo').fill('minhasenha');
await p2.getByRole('button', { name: 'Abrir' }).click();
await p2.getByTestId('resumo-backup').waitFor({ timeout: 15000 });
const resumo = nb(await p2.getByTestId('resumo-backup').innerText());
confere('Mostra o que tem no backup antes de restaurar', resumo.includes('1 lançamentos') && resumo.includes('1 cofrinhos') && resumo.includes('1 arquivos (contratos e comprovantes)'), resumo.replace(/\n/g, ' · '));
confere('Restaurar só depois de confirmar que entende a substituição', await p2.getByRole('button', { name: 'Restaurar backup' }).isDisabled());
await p2.screenshot({ path: join(CAPTURAS, 'backup-restaurar.png'), fullPage: true });
await p2.locator('#backup-entendi').check();
await p2.getByRole('button', { name: 'Restaurar backup' }).click();
await p2.getByTestId('aviso').filter({ hasText: 'Backup restaurado' }).waitFor({ timeout: 10000 });
confere('Restaurado: avisa para cadastrar a chave Pix de novo', nb(await p2.getByTestId('aviso').innerText()).includes('cadastre e teste de novo a chave Pix'));
await p2.goto(`${URL_APP}/lancamentos?tipo=despesa`);
await p2.getByRole('button', { name: 'Mês anterior' }).waitFor();
await p2.getByLabel('Escolher outro período').check();
await p2.locator('#filtro-inicio').fill('01/01/2026');
await p2.locator('#filtro-fim').fill('31/12/2026');
await p2.getByTestId('lista-lancamentos').waitFor({ timeout: 5000 }).catch(() => {});
confere('No aparelho novo, os lançamentos voltaram', nb(await p2.getByTestId('lista-lancamentos').innerText()).includes('Padaria do bairro'));
await p2.goto(`${URL_APP}/cofrinhos/1`);
await p2.getByTestId('comprovantes').waitFor({ timeout: 8000 }).catch(() => {});
confere('Cofrinho e comprovante voltaram', (await p2.getByTestId('saldo-cofrinho').innerText()).includes('500,00') && (await p2.getByTestId('comprovantes').count()) === 1);
await p2.goto(`${URL_APP}/cofrinhos`);
await p2.getByRole('link', { name: 'Cadastrar chave Pix' }).waitFor({ timeout: 8000 }).catch(() => {});
confere('A chave Pix não veio (precisa cadastrar e testar de novo)', await p2.getByRole('link', { name: 'Cadastrar chave Pix' }).isVisible());
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de backup', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
