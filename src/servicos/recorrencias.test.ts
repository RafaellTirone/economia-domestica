import { beforeEach, describe, expect, it } from 'vitest';
import { banco } from '../db/banco';
import type { DadosLancamento } from './lancamentos';
import {
  alterarDaquiPraFrente, apagarRepeticao, contasDoMes, criarComRepeticao, dataNoMes, excluirSoEsteMes, gerarContasFixas, pararDeRepetir, somarMeses,
} from './recorrencias';

beforeEach(async () => { await banco.delete(); await banco.open(); });

const aluguel = (data: string, valor = 150000): DadosLancamento => ({
  tipo: 'despesa', data, descricao: 'Aluguel', valor, categoriaId: 1, forma: 'pix', fixa: true, situacao: 'a_pagar', parcelas: 1,
});
const doAluguel = async () => (await banco.lancamentos.toArray()).filter((l) => l.descricao === 'Aluguel').sort((a, b) => a.data.localeCompare(b.data));

describe('contas que se repetem', () => {
  it('datas: dia 31 cai no último dia em meses curtos e soma meses virando o ano', () => {
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(dataNoMes('2028-02', 30)).toBe('2028-02-29');
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });

  it('cria a conta deste mês e já gera a do mês que vem, sem duplicar ao gerar de novo', async () => {
    await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-10-10', '2026-11-10']);
    expect(await gerarContasFixas('2026-10-31')).toBe(0);
    // virou o mês: gera dezembro
    expect(await gerarContasFixas('2026-11-01')).toBe(1);
    const lista = await doAluguel();
    expect(lista.map((l) => l.data)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
    expect(lista.every((l) => l.fixa && l.recorrenciaId === lista[0].recorrenciaId)).toBe(true);
    expect(lista[1].situacao).toBe('a_pagar');
  });

  it('desfazer logo depois de criar apaga a repetição e os meses gerados', async () => {
    const { recId } = await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    await apagarRepeticao(recId);
    expect(await doAluguel()).toHaveLength(0);
    expect(await gerarContasFixas('2026-12-01')).toBe(0);
  });

  it('lançamento com data antiga não cria os meses do meio (evita duplicar o que já foi lançado)', async () => {
    await criarComRepeticao(aluguel('2026-06-05'), '2026-10-31');
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-06-05', '2026-10-05', '2026-11-05']);
  });

  it('receita do passado entra como recebida; do futuro, a receber', async () => {
    await criarComRepeticao({ ...aluguel('2026-10-05'), tipo: 'receita', descricao: 'Salário', situacao: 'pago' }, '2026-10-31');
    await gerarContasFixas('2026-11-06');
    const sal = (await banco.lancamentos.toArray()).filter((l) => l.descricao === 'Salário').sort((a, b) => a.data.localeCompare(b.data));
    expect(sal.map((l) => [l.data, l.situacao])).toEqual([['2026-10-05', 'pago'], ['2026-11-05', 'a_pagar'], ['2026-12-05', 'a_pagar']]);
  });

  it('excluir só este mês não volta a ser gerado; desfazer devolve', async () => {
    await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    const nov = (await doAluguel())[1];
    const desfazer = await excluirSoEsteMes(nov.id!);
    await gerarContasFixas('2026-10-31');
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-10-10']);
    await desfazer!.executar();
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-10-10', '2026-11-10']);
  });

  it('alterar daqui pra frente muda o valor e o dia dos meses seguintes a pagar, não os pagos', async () => {
    await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    await gerarContasFixas('2026-11-01');
    const [out, nov] = await doAluguel();
    await banco.lancamentos.update(out.id!, { situacao: 'pago' });
    await alterarDaquiPraFrente(nov.id!, aluguel('2026-11-15', 165000));
    await banco.lancamentos.update(nov.id!, { valor: 165000, data: '2026-11-15' });
    const lista = await doAluguel();
    expect(lista.map((l) => [l.data, l.valor])).toEqual([['2026-10-10', 150000], ['2026-11-15', 165000], ['2026-12-15', 165000]]);
    await gerarContasFixas('2026-12-01');
    expect((await doAluguel()).at(-1)).toMatchObject({ data: '2027-01-15', valor: 165000 });
  });

  it('mudar só o valor de uma conta do dia 31 num mês de 30 dias mantém o dia 31', async () => {
    await criarComRepeticao({ ...aluguel('2026-10-31'), descricao: 'Aluguel' }, '2026-10-31');
    const nov = (await doAluguel())[1];
    expect(nov.data).toBe('2026-11-30');
    await alterarDaquiPraFrente(nov.id!, { ...aluguel('2026-11-30', 160000) });
    await gerarContasFixas('2026-11-01');
    expect((await doAluguel()).at(-1)).toMatchObject({ data: '2026-12-31', valor: 160000 });
  });

  it('parar de repetir apaga os meses seguintes a pagar e não gera mais', async () => {
    await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    const recId = Number((await doAluguel())[0].recorrenciaId);
    const desfazer = await pararDeRepetir(recId, '2026-11');
    await gerarContasFixas('2027-03-01');
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-10-10']);
    await desfazer!.executar();
    expect((await doAluguel()).map((l) => l.data)).toEqual(['2026-10-10', '2026-11-10']);
  });

  it('contas do mês: repetidas + a pagar (sem parcelas do cartão) e previstas em meses futuros', async () => {
    await criarComRepeticao(aluguel('2026-10-10'), '2026-10-31');
    await banco.lancamentos.bulkAdd([
      { tipo: 'despesa', data: '2026-10-20', descricao: 'IPVA', valor: 50000, categoriaId: 3, forma: 'pix', fixa: false, situacao: 'a_pagar', criadoEm: '' },
      { tipo: 'despesa', data: '2026-10-21', descricao: 'Mercado', valor: 30000, categoriaId: 2, forma: 'pix', fixa: false, situacao: 'pago', criadoEm: '' },
      { tipo: 'despesa', data: '2026-10-22', descricao: 'TV 2/10', valor: 20000, categoriaId: 2, forma: 'credito', fixa: false, situacao: 'a_pagar', criadoEm: '', parcela: { numero: 2, total: 10, grupoId: 'x' } },
    ]);
    const todos = await banco.lancamentos.toArray();
    const recs = await banco.recorrencias.toArray();
    expect(contasDoMes(todos, recs, '2026-10', '2026-10-31').map((c) => c.descricao)).toEqual(['Aluguel', 'IPVA']);
    const fev = contasDoMes(todos, recs, '2027-02', '2026-10-31');
    expect(fev).toHaveLength(1);
    expect(fev[0]).toMatchObject({ descricao: 'Aluguel', data: '2027-02-10', paga: false });
    expect(fev[0].lancamento).toBeUndefined();
  });
});

describe('migração dos lançamentos "fixa" antigos', () => {
  it('vira uma repetição por descrição + categoria, ligando os lançamentos antigos', async () => {
    const { default: Dexie } = await import('dexie');
    const { BancoFinancas } = await import('../db/banco');
    const antigo = new Dexie('teste-migracao');
    antigo.version(3).stores({
      categorias: '++id, nome, tipo, ordem', lancamentos: '++id, data, tipo, categoriaId, situacao, recorrenciaId, [tipo+data]', configuracoes: 'chave',
      emprestimos: '++id, nome', pagamentosParcela: '++id, emprestimoId, [emprestimoId+numeroParcela]', arquivos: '++id',
      cofrinhos: '++id, nome', movimentosCofrinho: '++id, cofrinhoId, data', desejos: '++id, nome',
    });
    const base = { tipo: 'despesa', categoriaId: 1, forma: 'pix', situacao: 'pago', criadoEm: '' };
    await antigo.table('lancamentos').bulkAdd([
      { ...base, data: '2026-08-10', descricao: 'Aluguel', valor: 140000, fixa: true },
      { ...base, data: '2026-09-10', descricao: 'aluguel ', valor: 150000, fixa: true },
      { ...base, data: '2026-09-15', descricao: 'Internet', valor: 9990, fixa: true, categoriaId: 4 },
      { ...base, data: '2026-09-20', descricao: 'Mercado', valor: 50000, fixa: false },
    ]);
    antigo.close();
    const novo = new BancoFinancas('teste-migracao');
    await novo.open();
    const recs = await novo.recorrencias.toArray();
    expect(recs.map((r) => [r.descricao, r.valor, r.dia])).toEqual([['aluguel', 150000, 10], ['Internet', 9990, 15]]);
    const lancs = await novo.lancamentos.toArray();
    expect(lancs.filter((l) => l.recorrenciaId === String(recs[0].id))).toHaveLength(2);
    expect(lancs.find((l) => l.descricao === 'Mercado')!.recorrenciaId).toBeUndefined();
    novo.close();
    await Dexie.delete('teste-migracao');
  });
});
