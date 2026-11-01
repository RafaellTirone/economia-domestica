// Auditoria das contas que se repetem e da tela "Contas do mês" (checklist pago / a pagar).
// Uso: npm run build && npm run test:e2e
import { readFileSync } from 'node:fs';
import { confere, encerrar, hoje, iniciarServidor, iso, nb, playwright, verificarTela } from './apoio.mjs';

const URL_APP = await iniciarServidor(4189);
const navegador = await playwright.chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, acceptDownloads: true });
// Guarda as notificações mostradas, para conferir o aviso ao abrir o app.
// O Chromium sem tela não informa a permissão concedida, então ela é simulada como "permitida".
await ctx.addInitScript(() => {
  window.__avisos = [];
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = function (titulo, op) { window.__avisos.push([titulo, op?.body]); return Promise.resolve(); };
  const Original = window.Notification;
  if (Original) {
    const Falsa = function (titulo, op) { window.__avisos.push([titulo, op?.body]); };
    Object.defineProperty(Falsa, 'permission', { get: () => 'granted' });
    Falsa.requestPermission = () => Promise.resolve('granted');
    window.Notification = Falsa;
  }
});
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(e.message));
const aviso = () => page.getByTestId('aviso');
const resumo = async () => nb(await page.getByTestId('resumo-contas').innerText());
const contas = async () => (await page.getByTestId('conta').allInnerTexts()).map(nb);
const dia1 = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
const ultimoDia = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

async function lancar({ tipo = 'Gastei', categoria, valor, descricao, data, pago }) {
  await page.goto(`${URL_APP}/lancar`);
  await page.getByRole('heading', { name: 'Novo lançamento' }).waitFor();
  if (tipo === 'Recebi') await page.getByRole('radio', { name: 'Recebi' }).click();
  await page.getByRole('button', { name: categoria, exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill(valor);
  await page.getByLabel(/Descrição/).fill(descricao);
  await page.locator('#campo-data').fill(data);
  const caixa = page.getByLabel(tipo === 'Gastei' ? /Já foi pago/ : /Já recebi/);
  if ((await caixa.isChecked()) !== pago) await caixa.click();
  await page.getByLabel(/Repete todo mês/).check();
  await page.locator('form button[type=submit]').click();
  await aviso().waitFor();
  return nb(await aviso().innerText());
}

await page.goto(URL_APP);
await page.getByRole('heading', { name: 'Envelopes do mês' }).waitFor();

// 1. Tela vazia explica o que fazer
await page.getByRole('button', { name: 'Mais' }).click();
await page.getByRole('dialog').getByRole('link', { name: 'Contas do mês' }).click();
await page.getByRole('heading', { name: 'Contas do mês' }).waitFor();
confere('Sem contas: explica como marcar "Repete todo mês"', (await resumo()).includes('Repete todo mês'));

// 2. Lançar contas que se repetem
const t = await lancar({ categoria: 'Moradia', valor: '1.500,00', descricao: 'Aluguel', data: dia1, pago: false });
confere('Aviso confirma "Vai se repetir todo mês."', t.includes('Vai se repetir todo mês.'), t);
await lancar({ categoria: 'Contas da casa', valor: '99,90', descricao: 'Internet', data: ultimoDia, pago: false });
await lancar({ tipo: 'Recebi', categoria: 'Salário', valor: '6.500,00', descricao: 'Salário', data: dia1, pago: true });

// 3. Checklist do mês
await page.goto(`${URL_APP}/contas`);
await page.getByTestId('conta').first().waitFor();
let lista = await contas();
confere('Contas do mês lista Aluguel e Internet (receita não entra)', lista.length === 2 && lista[0].includes('Aluguel') && lista[1].includes('Internet'), lista.join(' | '));
confere('Resumo: Pagas R$ 0,00 de R$ 1.599,90', (await resumo()).includes('Pagas R$ 0,00 de R$ 1.599,90'), await resumo());
if (hoje.getDate() > 1) confere('Aluguel do dia 1 sem pagar aparece "atrasada"', lista[0].includes('atrasada há'), lista[0]);
confere('Internet do último dia mostra o prazo ("vence…")', /vence (hoje|amanhã|em \d+ dias)/.test(lista[1]), lista[1]);
await verificarTela(page, 'Contas do mês · celular');
await page.getByRole('checkbox', { name: /Aluguel/ }).click();
await aviso().waitFor();
await page.getByTestId('resumo-contas').filter({ hasText: 'Pagas R$ 1.500,00' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Ticar o Aluguel: "Pagas R$ 1.500,00 de R$ 1.599,90" e falta R$ 99,90', (await resumo()).includes('Pagas R$ 1.500,00 de R$ 1.599,90') && (await resumo()).includes('Falta pagar R$ 99,90'));
confere('Aviso "Aluguel marcada como paga."', nb(await aviso().innerText()).includes('Aluguel marcada como paga.'));
await page.reload();
await page.getByTestId('conta').first().waitFor();
confere('Depois de recarregar, o Aluguel continua pago', (await page.getByRole('checkbox', { name: /Aluguel/ }).getAttribute('aria-checked')) === 'true');
const repet = (await page.getByTestId('repeticao').allInnerTexts()).map(nb);
confere('"Contas que se repetem" mostra as 3 (Aluguel, Internet, Salário)', repet.length === 3 && repet.some((r) => r.includes('Receita') && r.includes('Salário')), repet.join(' | '));

// 4. Mês que vem: já criadas, a pagar
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByTestId('resumo-contas').filter({ hasText: 'Pagas R$ 0,00 de R$ 1.599,90' }).waitFor({ timeout: 5000 }).catch(() => {});
lista = await contas();
confere('Mês que vem já tem Aluguel e Internet a pagar', lista.length === 2 && (await resumo()).includes('Pagas R$ 0,00 de R$ 1.599,90'), lista.join(' | '));

// 5. Alterar "neste e nos próximos meses"
await page.getByRole('link', { name: 'Internet' }).click();
await page.getByRole('heading', { name: 'Editar lançamento' }).waitFor();
confere('Editar conta que se repete pergunta "Só neste mês" ou "Neste e nos próximos"', await page.getByLabel('Neste e nos próximos meses').isVisible());
await page.getByLabel('Valor', { exact: true }).fill('119,90');
await page.getByLabel('Neste e nos próximos meses').check();
await page.locator('form button[type=submit]').click();
await aviso().filter({ hasText: 'próximos meses' }).waitFor();
await page.goto(`${URL_APP}/contas`);
await page.getByTestId('conta').first().waitFor();
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByTestId('resumo-contas').filter({ hasText: 'R$ 1.619,90' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Mês que vem: Internet com o valor novo (total R$ 1.619,90)', (await resumo()).includes('de R$ 1.619,90'), await resumo());
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByTestId('conta').filter({ hasText: 'prevista' }).first().waitFor({ timeout: 5000 }).catch(() => {});
confere('Daqui a 2 meses (prevista) já usa o valor novo: total R$ 1.619,90', (await resumo()).includes('de R$ 1.619,90'), await resumo());
confere('Meses mais distantes mostram as contas como "prevista"', (await contas()).every((c) => c.includes('prevista')));
await page.getByRole('button', { name: 'Mês anterior' }).click();
await page.getByRole('button', { name: 'Mês anterior' }).click();
await page.getByTestId('resumo-contas').filter({ hasText: 'R$ 1.599,90' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Este mês continua com o valor antigo (R$ 99,90)', (await resumo()).includes('de R$ 1.599,90'), await resumo());

// 6. Excluir só a deste mês (do mês que vem) e não voltar
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByRole('link', { name: 'Aluguel' }).click();
await page.getByRole('button', { name: 'Excluir lançamento' }).click();
await page.getByRole('button', { name: 'Só a deste mês' }).click();
await aviso().filter({ hasText: 'Conta deste mês excluída.' }).waitFor();
await page.goto(`${URL_APP}/contas`);
await page.getByTestId('conta').first().waitFor();
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.reload();
await page.getByTestId('conta').first().waitFor();
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByTestId('resumo-contas').filter({ hasText: 'de R$ 119,90' }).waitFor({ timeout: 5000 }).catch(() => {});
lista = await contas();
confere('Aluguel excluído "só deste mês" não volta (mesmo recarregando)', lista.length === 1 && lista[0].includes('Internet'), lista.join(' | '));
await page.getByRole('button', { name: 'Mês anterior' }).click();

// 7. Parar de repetir
await page.getByTestId('repeticao').filter({ hasText: 'Internet' }).getByRole('button', { name: 'Parar de repetir' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Parar' }).click();
await aviso().filter({ hasText: 'não vai mais se repetir' }).waitFor();
confere('Parar de repetir tira da lista de repetições', (await page.getByTestId('repeticao').count()) === 2);
confere('A Internet deste mês continua', (await contas()).some((c) => c.includes('Internet')));
await page.getByRole('button', { name: 'Próximo mês' }).click();
await page.getByTestId('resumo-contas').filter({ hasText: 'Nenhuma conta' }).waitFor({ timeout: 5000 }).catch(() => {});
confere('Mês que vem fica sem a Internet', (await page.getByTestId('conta').count()) === 0);

// 8. Lembretes: arquivo da agenda e aviso ao abrir o app
await page.goto(`${URL_APP}/configuracoes`);
const [baixado] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Pôr os vencimentos na agenda' }).click()]);
const ics = readFileSync(await baixado.path(), 'utf8');
confere('Agenda: arquivo .ics com nome e formato certos', baixado.suggestedFilename().endsWith('.ics') && ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR'), baixado.suggestedFilename());
confere('Agenda: tem o Aluguel dos próximos meses com aviso 3 dias antes e no dia', ics.includes('SUMMARY:Pagar Aluguel') && ics.includes('TRIGGER:-P2DT15H') && ics.includes('TRIGGER:PT9H'));
confere('Agenda: não inclui a Internet que parou de repetir (além deste mês)', (ics.match(/SUMMARY:Pagar Internet/g) ?? []).length <= 1);
await aviso().filter({ hasText: 'lembretes prontos' }).waitFor();
await page.getByLabel(/Avisar quando eu abrir o app/).check();
await aviso().filter({ hasText: 'ao abrir o app' }).waitFor();
await page.goto(URL_APP);
await page.getByTestId('atencao').waitFor();
await page.waitForFunction(() => window.__avisos.length > 0, null, { timeout: 5000 }).catch(() => {});
const avisos = await page.evaluate(() => window.__avisos);
confere('Ao abrir o app: notificação com o que vence (Internet hoje/logo)', avisos.length === 1 && /Internet|vencimento|atrasada/.test(avisos[0][1]), JSON.stringify(avisos));
await page.reload();
await page.getByTestId('atencao').waitFor();
await page.waitForTimeout(800);
confere('Aviso aparece só uma vez por dia', (await page.evaluate(() => window.__avisos.length)) === 0);

// 9. Visão geral: "Precisa da sua atenção", contas do mês e para onde foi o dinheiro
await page.goto(URL_APP);
await page.getByTestId('atencao').waitFor();
const atencao = nb(await page.getByTestId('atencao').innerText());
confere('Visão geral avisa a conta que vence (Internet)', atencao.includes('Internet'), atencao.replace(/\n/g, ' · '));
confere('Visão geral lembra de fazer a cópia de segurança', atencao.includes('cópia de segurança'));
confere('Visão geral mostra o resumo das contas do mês', nb(await page.getByTestId('resumo-contas-inicio').innerText()).includes('Pagas R$ 1.500,00'));
const divisao = nb(await page.getByTestId('para-onde-foi').innerText());
confere('Barra "Para onde foi o dinheiro" mostra Moradia e o que sobrou', divisao.includes('Moradia') && divisao.includes('Sobrou'), divisao.replace(/\n/g, ' · '));
confere('Visão geral mostra o resumo do ano', await page.getByTestId('resumo-ano').isVisible());
await verificarTela(page, 'Visão geral completa · celular');

// 10. Notebook
const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
const p2 = await ctx2.newPage();
await p2.goto(`${URL_APP}/contas`);
await p2.getByRole('heading', { name: 'Contas do mês' }).waitFor();
await verificarTela(p2, 'Contas do mês · notebook');
await ctx2.close();

confere('Nenhum erro no console durante a auditoria de contas', erros.length === 0, erros.join(' | '));
await navegador.close();
encerrar();
