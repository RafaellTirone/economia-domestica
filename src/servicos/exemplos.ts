import { useLiveQuery } from 'dexie-react-hooks';
import { banco } from '../db/banco';
import { categoriasPadrao, idDeSubcategoria } from '../db/categoriasPadrao';
import type { Categoria, Centavos, DataISO, FormaPagamento, Lancamento, Recorrencia } from '../tipos';
import { diasNoMes, hojeISO, montarData } from '../utils/datas';
import { montarLancamentos } from './lancamentos';
import { gerarContasFixas, mesDe, somarMeses } from './recorrencias';

// Dados de exemplo: uma casa fictícia com 4 meses de uso, para conhecer o app sem digitar nada.
// Tudo fica marcado com "exemplo: true", para apagar só os exemplos depois sem mexer no que é seu.
// Também aqui: "Apagar tudo" (volta o app ao estado de recém-instalado).

const CHAVE_LIMITES = 'exemplo-limites';
const TABELAS_COM_EXEMPLO = ['lancamentos', 'recorrencias', 'emprestimos', 'pagamentosParcela', 'cofrinhos', 'movimentosCofrinho', 'desejos'] as const;

/** Há dados de exemplo gravados? */
export function useTemExemplos() {
  return useLiveQuery(async () => {
    for (const t of TABELAS_COM_EXEMPLO) {
      if (await (banco[t] as unknown as { filter(f: (x: { exemplo?: boolean }) => boolean): { count(): Promise<number> } }).filter((x) => !!x.exemplo).count()) return true;
    }
    return false;
  }, []);
}

/** Grava os dados de exemplo (somam-se ao que já existe, sem apagar nada). */
export async function carregarExemplos(hoje: DataISO = hojeISO()): Promise<void> {
  const agora = new Date().toISOString();
  const categorias = await banco.categorias.toArray();
  const cat = (nome: string, tipo: Categoria['tipo']) => categorias.find((c) => c.nome === nome && c.tipo === tipo) ?? categorias.find((c) => c.tipo === tipo)!;
  const sub = (c: Categoria, nome: string) => c.subcategorias.find((s) => s.id === idDeSubcategoria(nome))?.id;
  const mesAtual = mesDe(hoje);
  const meses = [3, 2, 1, 0].map((k) => somarMeses(mesAtual, -k));
  const dia = (mes: string, d: number) => { const [a, m] = mes.split('-').map(Number); return montarData(a, m, Math.min(d, diasNoMes(a, m))); };

  const moradia = cat('Moradia', 'despesa'), alimentacao = cat('Alimentação', 'despesa'), transporte = cat('Transporte', 'despesa');
  const contas = cat('Contas da casa', 'despesa'), saude = cat('Saúde', 'despesa'), lazer = cat('Lazer', 'despesa');
  const vestuario = cat('Vestuário', 'despesa'), dividas = cat('Dívidas', 'despesa');
  const salario = cat('Salário', 'receita'), extra = cat('Renda extra', 'receita');

  const lanc = (tipo: Lancamento['tipo'], data: DataISO, descricao: string, valor: Centavos, c: Categoria, subNome?: string, forma: FormaPagamento = 'pix'): Lancamento => ({
    tipo, data, descricao, valor, categoriaId: c.id!, subcategoriaId: subNome ? sub(c, subNome) : undefined, forma, fixa: false,
    situacao: 'pago', exemplo: true, criadoEm: agora,
  });

  await banco.transaction('rw', [banco.lancamentos, banco.recorrencias, banco.emprestimos, banco.pagamentosParcela, banco.cofrinhos, banco.movimentosCofrinho, banco.desejos, banco.categorias, banco.configuracoes], async () => {
    const novos: Lancamento[] = [];

    // Contas e receita que se repetem todo mês. Os meses passados entram já pagos; o atual é gerado pelo app.
    const repetem: [Recorrencia['tipo'], string, Centavos, Categoria, string | undefined, number][] = [
      ['receita', 'Salário', 480000, salario, 'Salário', 5],
      ['despesa', 'Aluguel', 135000, moradia, 'Aluguel / financiamento', 10],
      ['despesa', 'Água', 8650, contas, 'Água', 12],
      ['despesa', 'Luz', 17830, contas, 'Luz', 15],
      ['despesa', 'Internet', 9990, contas, 'Internet', 20],
    ];
    for (const [tipo, descricao, valor, c, s, d] of repetem) {
      const recId = await banco.recorrencias.add({
        tipo, descricao, valor, categoriaId: c.id!, subcategoriaId: s ? sub(c, s) : undefined, forma: tipo === 'receita' ? 'pix' : 'debito',
        dia: d, inicio: mesAtual, fim: null, pulados: [], exemplo: true, criadoEm: agora,
      });
      for (const m of meses.slice(0, 3)) novos.push({ ...lanc(tipo, dia(m, d), descricao, valor, c, s, tipo === 'receita' ? 'pix' : 'debito'), fixa: true, recorrenciaId: String(recId) });
    }

    // Gastos do dia a dia, variando um pouco de um mês para outro
    const fator = [1, 0.92, 1.08, 0.97];
    meses.forEach((m, i) => {
      const f = fator[i];
      const lista: Lancamento[] = [
        lanc('despesa', dia(m, 6), 'Compra do mês', Math.round(58000 * f), alimentacao, 'Compra do mês', 'debito'),
        lanc('despesa', dia(m, 13), 'Feira', Math.round(9500 * f), alimentacao, 'Feira / hortifrúti'),
        ...[3, 11, 18, 25].map((d) => lanc('despesa', dia(m, d), 'Padaria', 2800, alimentacao, 'Padaria', 'dinheiro')),
        lanc('despesa', dia(m, 19), 'Delivery', 6400, alimentacao, 'Delivery', 'credito'),
        ...[8, 22].map((d) => lanc('despesa', dia(m, d), 'Gasolina', 20000, transporte, 'Combustível', 'debito')),
        lanc('despesa', dia(m, 16), 'Farmácia', Math.round(7800 * f), saude, 'Farmácia'),
        lanc('despesa', dia(m, 27), 'Passeio no parque', Math.round(12000 * f), lazer, 'Passeios', 'credito'),
      ];
      if (i === 1) lista.push(lanc('receita', dia(m, 21), 'Venda de bolos', 65000, extra, 'Vendas'));
      novos.push(...lista.filter((l) => l.data <= hoje));
    });

    // Compra parcelada no cartão: cada parcela no mês dela
    const geladeira = montarLancamentos({
      tipo: 'despesa', data: dia(meses[1], 14), descricao: 'Geladeira', valor: 239990, categoriaId: moradia.id!, subcategoriaId: sub(moradia, 'Móveis e utensílios'),
      forma: 'credito', fixa: false, situacao: 'pago', parcelas: 10,
    }, new Date());
    novos.push(...geladeira.map((l) => ({ ...l, exemplo: true })));
    novos.push(lanc('despesa', dia(meses[2], 9), 'Tênis', 24990, vestuario, 'Calçados', 'credito'));

    // Empréstimo pessoal: 12x de R$ 517,41 a 3,5% ao mês, parcelas vencidas já pagas
    const emp = {
      nome: 'Empréstimo pessoal', instituicao: 'Banco Exemplo', numeroContrato: 'EX-0001', tipo: 'pessoal' as const, valorEmprestado: 500000,
      numeroParcelas: 12, valorParcela: 51741, taxaJuros: 3.5, periodoTaxa: 'mes' as const, cetAnual: null, sistema: 'price' as const,
      dataContratacao: dia(somarMeses(mesAtual, -4), 15), dataPrimeiraParcela: dia(meses[0], 15), multaAtraso: 2, jurosMora: 1, periodoMora: 'mes' as const,
      trechos: {}, termosConferidos: true, contratoArquivoId: null, exemplo: true, criadoEm: agora,
    };
    const empId = await banco.emprestimos.add(emp);
    for (const [i, m] of meses.entries()) {
      const venc = dia(m, 15);
      if (venc >= hoje) break;
      const lancamentoId = await banco.lancamentos.add({
        ...lanc('despesa', venc, `${emp.nome} — parcela ${i + 1} de ${emp.numeroParcelas}`, emp.valorParcela, dividas, 'Parcela de empréstimo', 'debito'),
      });
      await banco.pagamentosParcela.add({ emprestimoId: empId, numeroParcela: i + 1, dataPagamento: venc, valorPago: emp.valorParcela, lancamentoId, exemplo: true });
    }

    // Cofrinho com um depósito por mês
    const cofrinhoId = await banco.cofrinhos.add({
      nome: 'Reserva de emergência', meta: 600000, prazo: null, ondeGuarda: 'tesouro-selic', rendimentoMensal: 0.8, depositoMensal: 30000, exemplo: true, criadoEm: agora,
    });
    for (const m of meses) {
      const data = dia(m, 7);
      if (data > hoje) continue;
      const lancamentoId = await banco.lancamentos.add({ ...lanc('guardado', data, 'Guardado no cofrinho Reserva de emergência', 30000, alimentacao), categoriaId: 0 });
      await banco.movimentosCofrinho.add({ cofrinhoId, tipo: 'deposito', valor: 30000, data, via: 'manual', lancamentoId, exemplo: true });
    }

    // Um desejo de compra
    await banco.desejos.add({
      nome: 'Notebook para estudar', precoVista: 350000, parcelas: 10, valorParcela: 38990, prioridade: 'media', guardarPorMes: 25000,
      quando: null, cofrinhoId: null, comprado: false, exemplo: true, criadoEm: agora,
    });

    await banco.lancamentos.bulkAdd(novos);

    // Limites de exemplo só onde a pessoa ainda não definiu (e anotados para desfazer depois)
    const limites: Record<number, Centavos> = {};
    for (const [c, v] of [[alimentacao, 120000], [lazer, 25000]] as const) {
      if (!c.limiteMensal) { limites[c.id!] = v; await banco.categorias.update(c.id!, { limiteMensal: v }); }
    }
    const antes = ((await banco.configuracoes.get(CHAVE_LIMITES))?.valor ?? {}) as Record<number, Centavos>;
    await banco.configuracoes.put({ chave: CHAVE_LIMITES, valor: { ...antes, ...limites } });
  });

  // Contas do mês atual (e do próximo); a Luz deste mês fica "a pagar" para mostrar o aviso
  await gerarContasFixas(hoje);
  const doMes = await banco.lancamentos.filter((l) => !!l.exemplo && !!l.recorrenciaId && mesDe(l.data) === mesAtual && l.data < hoje && l.descricao !== 'Luz').toArray();
  for (const l of doMes) await banco.lancamentos.update(l.id!, { situacao: 'pago' });
}

/** Apaga só o que veio dos dados de exemplo. Devolve quantos registros saíram. */
export async function apagarExemplos(): Promise<number> {
  return banco.transaction('rw', [...TABELAS_COM_EXEMPLO.map((t) => banco[t]), banco.categorias, banco.configuracoes], async () => {
    let total = 0;
    for (const t of TABELAS_COM_EXEMPLO) {
      total += await (banco[t] as unknown as { filter(f: (x: { exemplo?: boolean }) => boolean): { delete(): Promise<number> } }).filter((x) => !!x.exemplo).delete();
    }
    // Limites colocados pelo exemplo voltam a "sem limite" (se a pessoa não mudou o valor)
    const limites = ((await banco.configuracoes.get(CHAVE_LIMITES))?.valor ?? {}) as Record<string, Centavos>;
    for (const [id, valor] of Object.entries(limites)) {
      const c = await banco.categorias.get(Number(id));
      if (c && c.limiteMensal === valor) await banco.categorias.update(c.id!, { limiteMensal: null });
    }
    await banco.configuracoes.delete(CHAVE_LIMITES);
    return total;
  });
}

/** Apaga TUDO (lançamentos, dívidas, cofrinhos, contratos, chave Pix, configurações) e volta às categorias padrão. */
export async function apagarTudo(): Promise<void> {
  const tabelas = banco.tables;
  await banco.transaction('rw', tabelas, async () => {
    for (const t of tabelas) await t.clear();
    await banco.categorias.bulkAdd(categoriasPadrao());
  });
}
