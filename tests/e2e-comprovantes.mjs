// Auditoria dos comprovantes do cofrinho: anexar foto (reduzida) e PDF, ver em tela cheia,
// apagar com desfazer, recusar arquivo errado e apagar junto com o depósito.
// Uso: npm run build && npm run test:e2e
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4183);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));

await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
// Foto grande (3000 x 2000) gerada no navegador, como uma foto de celular
const fotoB64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
  const g = c.getContext('2d');
  for (let i = 0; i < 4000; i++) { g.fillStyle = `hsl(${i % 360},70%,${30 + (i % 50)}%)`; g.fillRect((i * 37) % 3000, (i * 53) % 2000, 60, 40); }
  g.fillStyle = '#000'; g.font = '120px sans-serif'; g.fillText('Comprovante Pix R$ 200,00', 200, 1000);
  return c.toDataURL('image/png').split(',')[1];
});
const foto = { name: 'comprovante-pix.png', mimeType: 'image/png', buffer: Buffer.from(fotoB64, 'base64') };
const pdf = { name: 'recibo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1') };
await page.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => { const tx = req.result.transaction('cofrinhos', 'readwrite'); tx.objectStore('cofrinhos').add({ nome: 'Viagem', meta: 400000, prazo: null, ondeGuarda: 'caixinha', rendimentoMensal: null, depositoMensal: null, criadoEm: '' }); tx.oncomplete = () => { req.result.close(); ok(); }; };
}));
const lerArquivos = () => page.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => { const g = req.result.transaction('arquivos').objectStore('arquivos').getAll(); g.onsuccess = async () => {
    const lista = [];
    for (const a of g.result) { let dim = null; if (a.tipo.startsWith('image/')) { const b = await createImageBitmap(a.dados); dim = [b.width, b.height]; } lista.push({ nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, dim }); }
    req.result.close(); ok(lista);
  }; };
}));

// 1. Depósito com 2 comprovantes
await page.goto(`${URL_APP}/cofrinhos/1`);
await page.getByRole('button', { name: 'Registrar depósito' }).click();
confere('Formulário do depósito tem "Anexar comprovante"', await page.getByText('Comprovante (opcional): print do Pix, foto do recibo ou PDF').isVisible());
await page.locator('#mov-comprovante').setInputFiles([foto, pdf]);
confere('Mostra os arquivos escolhidos antes de salvar', nb(await page.getByTestId('arquivos-escolhidos').innerText()).includes('comprovante-pix.png') && nb(await page.getByTestId('arquivos-escolhidos').innerText()).includes('recibo.pdf'));
await page.locator('#mov-valor').fill('200,00');
await page.locator('form').getByRole('button', { name: 'Registrar depósito' }).click();
await page.getByTestId('comprovantes').locator('li').nth(1).waitFor({ timeout: 15000 });
confere('Depósito salvo com 2 comprovantes no histórico', (await page.getByTestId('comprovantes').locator('li').count()) === 2);
const guardados = await lerArquivos();
const img = guardados.find((a) => a.tipo.startsWith('image/'));
confere(`Foto reduzida para economizar espaço (3000×2000 → ${img?.dim?.join('×')})`, img && img.dim[0] === 1600 && img.dim[1] === 1067 && img.tamanho < foto.buffer.length, JSON.stringify(img));
confere('Print de tela (PNG) continua PNG para o texto não borrar', img?.tipo === 'image/png');
confere('PDF guardado como PDF', guardados.some((a) => a.tipo === 'application/pdf' && a.nome === 'recibo.pdf'));

// 2. Ver em tela cheia
await page.getByRole('button', { name: /Ver comprovante comprovante-pix/ }).click();
await page.getByTestId('visualizador').waitFor();
confere('Tocar na miniatura abre a foto em tela cheia', await page.getByTestId('visualizador').getByRole('img').isVisible());
await page.screenshot({ path: join(CAPTURAS, 'comprovante-aberto.png') });
await verificarTela(page, 'Comprovante aberto · celular');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Ver comprovante recibo.pdf' }).click();
confere('PDF abre com o botão "Abrir PDF"', await page.getByRole('link', { name: 'Abrir PDF' }).isVisible());
await page.getByTestId('visualizador').getByRole('button', { name: 'Fechar', exact: true }).click();

// 3. Apagar comprovante e desfazer
await page.getByRole('button', { name: 'Ver comprovante recibo.pdf' }).click();
await page.getByRole('button', { name: 'Apagar comprovante' }).click();
await page.getByTestId('aviso').filter({ hasText: 'Comprovante apagado' }).waitFor();
await page.getByTestId('comprovantes').locator('li').nth(1).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
confere('Apagar comprovante tira do histórico', (await page.getByTestId('comprovantes').locator('li').count()) === 1);
await page.getByTestId('aviso').getByRole('button', { name: 'Desfazer' }).click();
await page.getByTestId('comprovantes').locator('li').nth(1).waitFor({ timeout: 5000 }).catch(() => {});
confere('"Desfazer" traz o comprovante de volta', (await page.getByTestId('comprovantes').locator('li').count()) === 2);

// 4. Arquivo errado é recusado; anexar mais depois
await page.locator('[id^="anexar-"]').first().setInputFiles({ name: 'pagina.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') });
await page.getByTestId('aviso').filter({ hasText: 'não é foto nem PDF' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Arquivo que não é foto nem PDF é recusado', nb(await page.getByTestId('aviso').innerText()).includes('“pagina.html” não é foto nem PDF.'));
const jpegB64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
  const g = c.getContext('2d');
  for (let i = 0; i < 20000; i++) { g.fillStyle = `rgb(${(i * 7) % 255},${(i * 13) % 255},${(i * 29) % 255})`; g.fillRect((i * 37) % 4000, (i * 53) % 3000, 25, 25); }
  return c.toDataURL('image/jpeg', 0.95).split(',')[1];
});
const fotoCamera = { name: 'foto-recibo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegB64, 'base64') };
await page.locator('[id^="anexar-"]').first().setInputFiles(fotoCamera);
await page.getByTestId('comprovantes').locator('li').nth(2).waitFor({ timeout: 15000 }).catch(() => {});
confere('"Anexar mais" no histórico adiciona outro comprovante', (await page.getByTestId('comprovantes').locator('li').count()) === 3);
const daCamera = (await lerArquivos()).find((a) => a.nome === 'foto-recibo.jpg');
confere(`Foto de câmera (4000×3000, ${Math.round(fotoCamera.buffer.length / 1024)} KB) reduzida para ${daCamera?.dim?.join('×')} e ${Math.round((daCamera?.tamanho ?? 0) / 1024)} KB`, daCamera?.dim?.[0] === 1600 && daCamera?.dim?.[1] === 1200 && daCamera.tamanho < fotoCamera.buffer.length / 2 && daCamera.tipo === 'image/jpeg');
await page.screenshot({ path: join(CAPTURAS, 'comprovantes-historico.png'), fullPage: true });
await verificarTela(page, 'Histórico com comprovantes · celular');

// 5. Continua depois de recarregar
await page.reload();
await page.getByTestId('comprovantes').locator('li').nth(2).waitFor({ timeout: 8000 }).catch(() => {});
confere('Depois de recarregar, os 3 comprovantes continuam', (await page.getByTestId('comprovantes').locator('li').count()) === 3);

// 6. Apagar o depósito apaga os comprovantes dele
await page.getByRole('button', { name: /^Apagar deposito/ }).click();
await page.getByText('Nenhum depósito ainda.').waitFor();
confere('Apagar o depósito apaga também os comprovantes guardados', (await lerArquivos()).length === 0);

confere('Nenhum erro no console durante a auditoria de comprovantes', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
