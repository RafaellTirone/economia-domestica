// Auditoria do app instalável: manifesto e ícones, funcionamento sem internet (service worker),
// virada do dia/mês com o app aberto e instruções de instalação (Android/iPhone).
// Uso: npm run build && npm run test:e2e
import { confere, encerrar, iniciarServidor, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4187);
const navegador = await playwright.chromium.launch();
const erros = [];
const vigiar = (p) => { p.on('console', (m) => m.type() === 'error' && erros.push(m.text())); p.on('pageerror', (e) => erros.push(e.message)); };

// 1. Manifesto e ícones
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
vigiar(page);
await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
// (a página não pode fazer conexões — trava de segurança —, então o robô busca o manifesto por fora)
const hrefManifesto = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
const manifesto = hrefManifesto ? await (await page.request.get(`${URL_APP}${hrefManifesto}`)).json() : null;
confere('Manifesto do app: nome, abre como aplicativo e em português', manifesto?.short_name === 'Nosso Dinheiro' && manifesto.display === 'standalone' && manifesto.lang === 'pt-BR' && manifesto.start_url === '/');
const tamanhoImagem = (src) => page.evaluate((s) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(`${img.naturalWidth}x${img.naturalHeight}`); img.onerror = () => ok('erro'); img.src = s; }), src);
const icones = [];
for (const i of manifesto.icons) icones.push(await tamanhoImagem(i.src));
confere('Ícones 192, 512 e "maskable" (Android) carregam no tamanho certo', icones.join(',') === '192x192,512x512,512x512' && manifesto.icons.some((i) => i.purpose === 'maskable'), icones.join(','));
confere('Ícone do iPhone (apple-touch-icon 180×180)', (await tamanhoImagem(await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href')))) === '180x180');
confere('Página continua sem poder fazer conexões (trava connect-src none)', (await (await page.request.get(URL_APP)).headers())['content-security-policy'].includes("connect-src 'none'"));

// 2. Sem internet
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const guardados = await page.evaluate(async () => { const c = await caches.open((await caches.keys()).find((k) => k.startsWith('nosso-dinheiro-'))); return (await c.keys()).map((r) => new URL(r.url).pathname); });
confere('Modo sem internet guarda o app inteiro (inclusive o leitor de contratos)', guardados.includes('/') && guardados.some((p) => p.includes('pdf.worker')) && guardados.some((p) => p.endsWith('.css')), `${guardados.length} arquivos`);
await ctx.setOffline(true);
await page.reload();
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor({ timeout: 10000 }).catch(() => {});
confere('SEM INTERNET: o app abre', await page.getByRole('heading', { name: 'Envelopes do mês' }).isVisible());
await page.goto(`${URL_APP}/relatorios`).catch(() => {});
await page.getByRole('heading', { name: 'Relatórios' }).waitFor({ timeout: 10000 }).catch(() => {});
confere('SEM INTERNET: abrir outra tela pelo endereço (Relatórios) funciona', await page.getByRole('heading', { name: 'Relatórios' }).isVisible());
await page.goto(`${URL_APP}/lancar`).catch(() => {});
await page.getByRole('button', { name: 'Alimentação', exact: true }).click();
await page.getByLabel('Valor', { exact: true }).fill('12,30');
await page.locator('form button[type=submit]').click();
await page.getByTestId('aviso').filter({ hasText: 'R$ 12,30' }).waitFor({ timeout: 8000 }).catch(() => {});
confere('SEM INTERNET: lançar uma despesa funciona', nb(await page.getByTestId('aviso').innerText()).includes('Despesa de R$ 12,30 salva.'));
await page.goto(`${URL_APP}/configuracoes`).catch(() => {});
await page.getByTestId('secao-instalar').waitFor({ timeout: 10000 });
confere('Configurações mostra como instalar o app', await page.getByTestId('secao-instalar').isVisible());
await verificarTela(page, 'Instalar · celular (sem internet)');
await ctx.setOffline(false);
await ctx.close();

// 3. Virada do dia/mês com o app aberto
const ctxRelogio = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', serviceWorkers: 'block' });
const p3 = await ctxRelogio.newPage();
vigiar(p3);
await p3.clock.install({ time: new Date(2026, 9, 31, 23, 58, 30) });
await p3.goto(URL_APP);
await p3.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();
confere('Às 23:58 de 31/10 mostra outubro', (await p3.getByRole('heading', { level: 1 }).innerText()).toLowerCase() === 'outubro de 2026');
await p3.clock.fastForward('03:00');
await p3.getByRole('heading', { level: 1, name: /novembro/i }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Passou da meia-noite com o app aberto: vira para novembro sozinho', (await p3.getByRole('heading', { level: 1 }).innerText()).toLowerCase() === 'novembro de 2026');
await ctxRelogio.close();

// 4. iPhone: passo a passo para instalar
const ctxIphone = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const p4 = await ctxIphone.newPage();
vigiar(p4);
await p4.goto(`${URL_APP}/configuracoes`);
await p4.getByTestId('secao-instalar').waitFor();
const passos = nb(await p4.getByTestId('passos-iphone').innerText());
confere('iPhone: explica por que instalar e o passo a passo (Compartilhar → Adicionar à Tela de Início)', passos.includes('Compartilhar') && passos.includes('Adicionar à Tela de Início') && await p4.getByText(/Safari pode apagar os dados/).isVisible());
await verificarTela(p4, 'Instalar · iPhone');
await ctxIphone.close();

confere('Nenhum erro no console durante a auditoria do app instalável', erros.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::ERR/.test(e)).length === 0, erros.join(' | '));
await navegador.close();
encerrar();
