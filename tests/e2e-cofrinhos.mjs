// Auditoria dos Cofrinhos e do Pix seguro: cria cofrinho, deposita, saca (com trava de reflexão),
// cadastra a chave Pix com os 4 passos, gera o Pix e testa as proteções: PIN errado, chave
// adulterada no aparelho, valor fora do comum, bloqueio por tentativas e "esqueci o PIN".
// Uso: npm run build && npm run test:e2e
import { join } from 'node:path';
import { CAPTURAS, confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4177);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const aviso = () => page.getByTestId('aviso');
const esperarAviso = (texto) => aviso().filter({ hasText: texto }).waitFor({ timeout: 8000 }).catch(() => {});
const saldo = async () => nb(await page.getByTestId('saldo-cofrinho').innerText());

// 1. Tela vazia
await page.goto(`${URL_APP}/cofrinhos`);
await page.getByRole('heading', { name: 'Cofrinhos', exact: true }).waitFor();
confere('Cofrinhos: abre (antes era "Em construção")', await page.getByRole('link', { name: 'Criar o primeiro cofrinho' }).isVisible());
confere('Cofrinhos: oferece cadastrar a chave Pix da reserva', await page.getByRole('link', { name: 'Cadastrar chave Pix' }).isVisible());
await verificarTela(page, 'Cofrinhos vazio · celular');

// 2. Criar cofrinho
await page.getByRole('link', { name: 'Criar o primeiro cofrinho' }).click();
await page.getByRole('button', { name: 'Criar cofrinho' }).click();
confere('Validação: pede nome e meta', await page.getByText(/Dê um nome ao cofrinho/).isVisible() && await page.getByText('Informe a meta em reais.').isVisible());
await page.locator('#cofrinho-nome').fill('Reserva de emergência');
await page.locator('#cofrinho-meta').fill('5.000,00');
await page.locator('#cofrinho-onde').selectOption('tesouro-selic');
confere('Explica onde o dinheiro fica (Tesouro Selic no seu CPF)', await page.getByText(/Título público no seu CPF/).isVisible());
await page.locator('#cofrinho-rendimentoMensal').fill('0,9');
await page.locator('#cofrinho-deposito').fill('500,00');

// Calendário do "Tenho uma data para chegar na meta"
await page.locator('#cofrinho-temPrazo').check();
await page.getByRole('button', { name: 'Abrir calendário: Até quando' }).click();
const cal = page.getByTestId('calendario');
await cal.waitFor();
confere('Calendário: abre ao tocar no desenho do calendário', await cal.isVisible());
confere('Calendário: tem todos os anos (1900 a 2100)', (await page.locator('#calendario-ano option').count()) === 201);
await page.locator('#calendario-ano').selectOption('2030');
await page.locator('#calendario-mes').selectOption('3');
await cal.getByRole('button', { name: '15 de março de 2030' }).click();
confere('Calendário: escolher ano, mês e dia preenche 15/03/2030', (await page.locator('#cofrinho-prazo').inputValue()) === '15/03/2030' && !(await cal.isVisible()));
await page.getByRole('button', { name: 'Abrir calendário: Até quando' }).click();
confere('Calendário: reabre no mês escolhido (março de 2030)', (await page.locator('#calendario-mes').inputValue()) === '3' && (await page.locator('#calendario-ano').inputValue()) === '2030');
await page.getByRole('button', { name: 'Próximo mês' }).last().click();
confere('Calendário: seta avança o mês (abril)', (await page.locator('#calendario-mes').inputValue()) === '4');
confere('Calendário: marca feriados (21 de abril, Tiradentes)', await cal.getByRole('button', { name: /21 de abril de 2030, feriado: Tiradentes/ }).isVisible());
await page.screenshot({ path: join(CAPTURAS, 'calendario.png') });
await verificarTela(page, 'Calendário aberto · celular');
await page.keyboard.press('Escape');
confere('Calendário: Esc fecha sem mudar a data', !(await cal.isVisible()) && (await page.locator('#cofrinho-prazo').inputValue()) === '15/03/2030');
await page.getByRole('button', { name: 'Abrir calendário: Até quando' }).click();
await cal.getByRole('button', { name: /^Hoje/ }).click();
const hojeTxt = `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
confere('Calendário: botão "Hoje"', (await page.locator('#cofrinho-prazo').inputValue()) === hojeTxt);
await page.locator('#cofrinho-prazo').fill('31122027');
confere('Digitar só os números (31122027) vira 31/12/2027', (await page.locator('#cofrinho-prazo').inputValue()) === '31/12/2027');
await page.locator('#cofrinho-prazo').fill('31/02/2027');
await page.locator('#cofrinho-rendimentoMensal').click();
confere('Data impossível (31/02) é recusada e volta para a anterior', (await page.locator('#cofrinho-prazo').inputValue()) === '31/12/2027' && await page.getByText('Data inválida. Use dd/mm/aaaa.').isVisible());
await verificarTela(page, 'Novo cofrinho · celular');
await page.getByRole('button', { name: 'Criar cofrinho' }).click();
await page.getByTestId('saldo-cofrinho').waitFor();
confere('Cofrinho criado começa em R$ 0,00', (await saldo()) === 'R$ 0,00');
confere('Previsão pelo valor planejado (R$ 500,00/mês)', nb(await page.getByTestId('previsao').innerText()).includes('No ritmo de R$ 500,00 por mês'));

// 3. Depósito manual
await page.getByRole('button', { name: 'Registrar depósito' }).click();
await page.locator('#mov-valor').fill('3.200,00');
await page.locator('form').getByRole('button', { name: 'Registrar depósito' }).click();
await esperarAviso('guardados');
confere('Depósito: aviso "R$ 3.200,00 guardados. Faltam R$ 1.800,00."', nb(await aviso().innerText()).includes('R$ 3.200,00 guardados. Faltam R$ 1.800,00.'));
await page.getByText('64%').first().waitFor({ timeout: 5000 }).catch(() => {});
confere('Saldo R$ 3.200,00 (64% da meta)', (await saldo()) === 'R$ 3.200,00' && (await page.getByText('64%').count()) > 0);
confere('Rendimento estimado ~R$ 28,80/mês', nb(await page.locator('main').innerText()).includes('~R$ 28,80 por mês'));

// 4. Saque com trava de reflexão + desfazer
await page.getByRole('button', { name: 'Registrar saque' }).click();
await page.locator('#mov-valor').fill('100,00');
await page.locator('form').getByRole('button', { name: 'Registrar saque' }).click();
confere('Saque antes da meta: "Tem certeza? Faltam só…"', (await page.getByTestId('trava-saque').innerText()).includes('Tem certeza? Faltam só R$'));
await page.getByRole('button', { name: 'Confirmar saque' }).click();
await esperarAviso('Saque');
confere('Saque registrado: saldo R$ 3.100,00', (await saldo()) === 'R$ 3.100,00');
await aviso().getByRole('button', { name: 'Desfazer' }).click();
await page.getByTestId('saldo-cofrinho').filter({ hasText: '3.200,00' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('"Desfazer" o saque volta para R$ 3.200,00', (await saldo()) === 'R$ 3.200,00');
await page.screenshot({ path: join(CAPTURAS, 'cofrinho-detalhe.png'), fullPage: true });
await verificarTela(page, 'Detalhe do cofrinho · celular');
const urlCofrinho = page.url();

// 5. Guardar não é despesa
await page.goto(`${URL_APP}/`);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
const renda = nb(await page.locator('section[aria-labelledby="titulo-renda"]').innerText());
confere('Visão geral: "Guardado R$ 3.200,00" e despesas R$ 0,00 (guardar não é gasto)', renda.includes('Guardado') && renda.includes('R$ 3.200,00') && /Despesas\s*R\$ 0,00/.test(renda), renda.replace(/\n/g, ' · '));
await page.goto(`${URL_APP}/lancamentos`);
confere('Lançamentos: aparece como "Cofrinho · não conta como despesa"', nb(await page.getByTestId('lista-lancamentos').innerText()).includes('Cofrinho · não conta como despesa'));

// 6. Guardar agora sem chave cadastrada
await page.goto(`${urlCofrinho}/guardar`);
await page.getByText(/cadastre primeiro a chave/).waitFor({ timeout: 8000 }).catch(() => {});
confere('Guardar agora sem chave: pede o cadastro com teste de R$ 0,01', await page.getByText(/cadastre primeiro a chave da sua conta de reserva/).isVisible());

// 7. Cadastro da chave Pix (4 passos)
await page.goto(`${URL_APP}/cofrinhos/pix`);
await page.getByRole('heading', { name: 'Cadastrar chave Pix' }).waitFor();
const textoAviso = nb(await page.getByTestId('aviso-pix').innerText());
confere('Aviso obrigatório: conferir a chave, teste R$ 0,01, não lê saldo, nunca pede senha', textoAviso.includes('Confira se a chave é da SUA conta de reserva') && textoAviso.includes('R$ 0,01') && textoAviso.includes('NÃO lê o saldo') && textoAviso.includes('nunca pede senha'));
confere('Só continua depois de marcar "Li e entendi"', await page.getByRole('button', { name: 'Continuar' }).isDisabled());
await page.locator('#pix-li').check();
await page.getByRole('button', { name: 'Continuar' }).click();
await page.locator('#pix-chave1').fill('123.456.789-00');
await page.locator('#pix-chave2').fill('123.456.789-00');
await page.locator('#pix-titular').fill('Rafael Teste');
await page.locator('#pix-banco').fill('Banco Horizonte');
await page.getByRole('button', { name: 'Continuar' }).click();
confere('CPF com dígito errado é recusado na hora', await page.getByText('CPF inválido. Confira os números.').isVisible());
await page.locator('#pix-chave1').fill('123.456.789-09');
await page.locator('#pix-chave2').fill('123.456.789-90');
await page.getByRole('button', { name: 'Continuar' }).click();
confere('Chave digitada duas vezes diferente é recusada', await page.getByText(/As duas chaves digitadas não são iguais/).isVisible());
await page.locator('#pix-chave2').fill('12345678909');
await page.locator('#pix-cidade').fill('Belo Horizonte');
await page.getByRole('button', { name: 'Continuar' }).click();
await page.locator('#pix-pin1').fill('123456');
await page.locator('#pix-pin2').fill('123456');
await page.getByRole('button', { name: 'Continuar' }).click();
confere('PIN fraco (123456) é recusado', await page.getByText(/Escolha um PIN menos óbvio/).isVisible());
await page.locator('#pix-pin1').fill('482916');
await page.locator('#pix-pin2').fill('482916');
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByRole('heading', { name: 'Teste com R$ 0,01' }).waitFor();
const codigoTeste = await page.getByTestId('codigo-pix').inputValue();
confere('Teste: Pix de R$ 0,01 para a chave digitada', codigoTeste.includes('br.gov.bcb.pix') && codigoTeste.includes('12345678909') && codigoTeste.includes('54040.01'), codigoTeste);
confere('Teste: mostra o nome que deve aparecer no banco', await page.getByText('Rafael Teste', { exact: true }).isVisible());
await page.screenshot({ path: join(CAPTURAS, 'pix-teste.png'), fullPage: true });
await verificarTela(page, 'Teste de R$ 0,01 · celular');
await page.getByRole('button', { name: /Apareceu MEU nome/ }).click();
await page.getByTestId('situacao-pix').waitFor({ timeout: 15000 });
confere('Chave verificada e protegida por PIN', nb(await page.getByTestId('situacao-pix').innerText()).includes('***.456.789-**') && nb(await page.getByTestId('situacao-pix').innerText()).includes('verificada'));
const guardado = await page.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => { const g = req.result.transaction('configuracoes').objectStore('configuracoes').get('pix-reserva'); g.onsuccess = () => { req.result.close(); ok(JSON.stringify(g.result)); }; };
}));
confere('No aparelho, a chave fica criptografada (o CPF não aparece no que é guardado)', !guardado.includes('12345678909') && guardado.includes('cifrado'));

// 8. Guardar agora com Pix
await page.goto(`${urlCofrinho}/guardar`);
await page.locator('#guardar-valor').fill('500,00');
await page.locator('#guardar-pin').fill('000001');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
await page.getByText(/PIN incorreto/).waitFor({ timeout: 15000 });
confere('PIN errado: recusa e mostra tentativas restantes', nb(await page.getByRole('alert').innerText()).includes('restam 4 tentativas'));
await page.locator('#guardar-pin').fill('482916');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
await page.getByTestId('pix-gerado').waitFor({ timeout: 15000 });
const codigo = await page.getByTestId('codigo-pix').inputValue();
confere('Pix gerado com o valor e a chave certos', codigo.includes('5406500.00') && codigo.includes('12345678909'));
const destino = nb(await page.getByTestId('destino-pix').innerText());
confere('Mostra para quem vai: seu nome, banco, chave mascarada, verificada', destino.includes('Rafael Teste (você)') && destino.includes('Banco Horizonte') && destino.includes('***.456.789-**') && destino.includes('verificada'));
confere('Mostra o selo de segurança', await page.getByTestId('selo').first().isVisible());
confere('Aviso: confira o SEU nome no app do banco', (await page.getByTestId('aviso-nome').innerText()).includes('SEU nome'));
confere('QR com prazo: "O código some em 4:5x"', /O código some em 4:5\d/.test(nb(await page.getByTestId('pix-gerado').innerText())) || /5:00/.test(nb(await page.getByTestId('pix-gerado').innerText())));
await page.screenshot({ path: join(CAPTURAS, 'pix-gerado.png'), fullPage: true });
await verificarTela(page, 'Pix gerado · celular');
await page.locator('#pix-comprovante').setInputFiles({ name: 'print-pix.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
confere('Pix: dá para anexar o comprovante antes do "Já paguei"', nb(await page.getByTestId('arquivos-escolhidos').innerText()).includes('print-pix.png'));
await page.getByRole('button', { name: /Já paguei/ }).click();
await page.getByTestId('saldo-cofrinho').filter({ hasText: '3.700,00' }).waitFor({ timeout: 8000 }).catch(() => {});
confere('"Já paguei" registra o depósito: R$ 3.700,00 (74%)', (await saldo()) === 'R$ 3.700,00');
await page.getByTestId('comprovantes').first().waitFor({ timeout: 8000 }).catch(() => {});
confere('Pix: o comprovante aparece no depósito', (await page.getByTestId('comprovantes').count()) >= 1);
confere('Histórico marca o depósito como Pix', nb(await page.getByTestId('historico-cofrinho').innerText()).includes('Depósito (Pix)'));

// 9. Valor fora do comum e "Algo está errado"
await page.goto(`${urlCofrinho}/guardar`);
await page.locator('#guardar-valor').fill('30.000,00');
await page.locator('#guardar-pin').fill('482916');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
confere('Valor fora do comum (R$ 30.000,00) pede confirmação antes de gerar', await page.getByText(/acima do habitual/).first().isVisible() && (await page.getByTestId('pix-gerado').count()) === 0);
await page.locator('#guardar-valor').fill('300,00');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
await page.getByTestId('pix-gerado').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Algo está errado' }).click();
confere('"Algo está errado": some o código e orienta a não pagar', (await page.getByTestId('pix-gerado').count()) === 0 && (await page.getByTestId('algo-errado').innerText()).includes('Não pague'));

// 10. Chave adulterada no aparelho: o lacre detecta e nada é gerado
await page.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('economia-domestica');
  req.onsuccess = () => {
    const tx = req.result.transaction('configuracoes', 'readwrite');
    const loja = tx.objectStore('configuracoes');
    const g = loja.get('pix-reserva');
    g.onsuccess = () => { const r = g.result; r.valor.cofre.cifrado = btoa('chave-do-golpista-trocada-aqui-1234567890'); loja.put(r); };
    tx.oncomplete = () => { req.result.close(); ok(); };
  };
}));
await page.goto(`${urlCofrinho}/guardar`);
await page.locator('#guardar-valor').fill('100,00');
await page.locator('#guardar-pin').fill('482916');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
await page.getByText(/a chave pode ter sido alterada/).waitFor({ timeout: 15000 }).catch(() => {});
confere('Chave adulterada: PIN certo não abre, avisa e NÃO gera Pix', (await page.getByTestId('pix-gerado').count()) === 0 && await page.getByText(/a chave pode ter sido alterada/).isVisible());

// 11. Bloqueio depois de 5 tentativas erradas
for (let i = 0; i < 4; i++) {
  await page.locator('#guardar-pin').fill('000002');
  await page.getByRole('button', { name: 'Gerar Pix' }).click();
  await page.getByRole('button', { name: 'Gerar Pix' }).waitFor();
  await page.waitForTimeout(400);
}
await page.locator('#guardar-pin').fill('482916');
await page.getByRole('button', { name: 'Gerar Pix' }).click();
await page.getByText(/Muitas tentativas erradas/).waitFor({ timeout: 15000 }).catch(() => {});
confere('Depois de 5 PINs errados, bloqueia por um tempo', await page.getByText(/Muitas tentativas erradas/).isVisible());

// 12. Esqueci o PIN: apaga só a chave
await page.goto(`${URL_APP}/cofrinhos`);
await page.getByRole('button', { name: 'Esqueci o PIN' }).click();
await page.getByRole('button', { name: 'Apagar chave' }).click();
await page.getByRole('link', { name: 'Cadastrar chave Pix' }).waitFor();
confere('"Esqueci o PIN" apaga só a chave; o cofrinho continua', nb(await page.getByTestId('total-cofrinhos').innerText()) === 'R$ 3.700,00');

// 13. Meta alcançada
await page.goto(urlCofrinho);
await page.getByRole('button', { name: 'Registrar depósito' }).click();
await page.locator('#mov-valor').fill('1.300,00');
await page.locator('form').getByRole('button', { name: 'Registrar depósito' }).click();
await page.getByTestId('meta-alcancada').waitFor({ timeout: 8000 }).catch(() => {});
confere('Meta alcançada: comemora', await page.getByTestId('meta-alcancada').isVisible());

// 14. Persistência e notebook
await page.reload();
await page.getByTestId('saldo-cofrinho').waitFor();
confere('Depois de recarregar, o saldo continua (R$ 5.000,00)', (await saldo()) === 'R$ 5.000,00');
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/cofrinhos`);
await p2.getByRole('heading', { name: 'Cofrinhos', exact: true }).waitFor();
await verificarTela(p2, 'Cofrinhos · notebook');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de cofrinhos', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
