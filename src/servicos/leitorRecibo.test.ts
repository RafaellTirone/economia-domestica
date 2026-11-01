import { describe, expect, it } from 'vitest';
import { analisarRecibo, limparNumeros, valoresDaLinha } from './leitorRecibo';

const hoje = '2026-11-01';

describe('leitura de recibo', () => {
  it('números: corrige confusões do leitor e entende os formatos de valor', () => {
    expect(limparNumeros('VALOR TOTAL R$ 312,4S')).toBe('VALOR TOTAL R$ 312,45');
    expect(limparNumeros('ARROZ 27,9O')).toBe('ARROZ 27,90');
    expect(valoresDaLinha('Valor a pagar R$ 1.234,56')).toEqual([123456]);
    expect(valoresDaLinha('TOTAL 54 ,90')).toEqual([5490]);
    expect(valoresDaLinha('VALOR: R$54.90')).toEqual([5490]);
    expect(valoresDaLinha('1,250 KG')).toEqual([]); // quantidade, não dinheiro
    expect(valoresDaLinha('31/10/2026 14:32:10')).toEqual([]);
  });

  it('cupom NFC-e de farmácia com desconto: pega o "Valor a pagar", não o total sem desconto', () => {
    const r = analisarRecibo(`DROGARIA SAO JOAO LTDA
CNPJ: 12.345.678/0001-90
AV BRASIL, 1000 - CENTRO
Documento Auxiliar da Nota Fiscal de Consumidor Eletronica
Codigo Descricao Qtde UN Vl Unit Vl Total
7891234 DIPIRONA 500MG 1 UN x 8,49 8,49
7894567 PROTETOR SOLAR FPS50 1 UN x 46,41 46,41
Qtd. total de itens 2
Valor total R$ 54,90
Desconto R$ 5,00
Valor a pagar R$ 49,90
FORMA PAGAMENTO VALOR PAGO
Cartao de Debito 49,90
Tributos totais incidentes (Lei Federal 12.741/2012) R$ 9,87
NFC-e n 000123456 Serie 001 31/10/2026 14:32:10`, hoje);
    expect(r.valor).toBe(4990);
    expect(r.confianca).toBe('alta');
    expect(r.data).toBe('2026-10-31');
    expect(r.estabelecimento).toBe('DROGARIA SAO JOAO');
    expect(r.sugestao).toEqual({ categoria: 'Saúde', subcategoria: 'Farmácia' });
    expect(r.candidatos.map((c) => c.valor)).toContain(5490); // o total sem desconto fica como alternativa
  });

  it('cupom de supermercado com erros de leitura e troco', () => {
    const r = analisarRecibo(`SUPERMERCADO BOM PRECO
CNPJ 98.765.432/0001-10
ARROZ TIPO 1 5KG 1 UN X 27,9O 27,90
FEIJAO 1KG 2 UN X 8,49 16,98
QTD. TOTAL DE ITENS 12
VALOR TOTAL R$ 312,4S
DINHEIRO 350,00
TROCO R$ 37,55
29/10/2026 18:01`, hoje);
    expect(r.valor).toBe(31245);
    expect(r.candidatos.map((c) => c.valor)).not.toContain(3755);
    expect(r.sugestao?.subcategoria).toBe('Compra do mês');
  });

  it('comprovante de maquininha: ignora o nome da maquininha e acha a padaria', () => {
    const r = analisarRecibo(`STONE
VIA CLIENTE
PADARIA PAO QUENTE
CNPJ: 11.222.333/0001-44
CREDITO A VISTA
************1234
VALOR: R$ 23,50
31/10/26 08:15`, hoje);
    expect(r.valor).toBe(2350);
    expect(r.estabelecimento).toBe('PADARIA PAO QUENTE');
    expect(r.data).toBe('2026-10-31');
    expect(r.sugestao?.subcategoria).toBe('Padaria');
  });

  it('print de comprovante de Pix: valor na linha de baixo e quem recebeu', () => {
    const r = analisarRecibo(`Comprovante de transferência
Pix enviado
Valor
R$ 150,00
Data e hora
30/10/2026 - 19:42
Para
JOSE DA SILVA
CPF ***.456.789-**
Instituição
BANCO X
ID da transação
E12345678202610301942abcdEF123456`, hoje);
    expect(r.valor).toBe(15000);
    expect(r.estabelecimento).toBe('JOSE DA SILVA');
    expect(r.data).toBe('2026-10-30');
  });

  it('sem nenhuma palavra-chave: sugere o maior valor com confiança baixa', () => {
    const r = analisarRecibo('Feira do Sr. Antonio\nTomate 6,00\nAlface 3,50\nBanana 8,00\n17,50', hoje);
    expect(r.valor).toBe(1750);
    expect(r.confianca).toBe('baixa');
    expect(r.sugestao?.subcategoria).toBe('Feira / hortifrúti');
  });

  it('texto sem valor nenhum', () => {
    const r = analisarRecibo('foto borrada\n???', hoje);
    expect(r.valor).toBeNull();
    expect(r.candidatos).toEqual([]);
  });

  it('data no futuro ou muito antiga não vale', () => {
    expect(analisarRecibo('TOTAL R$ 10,00\n15/12/2026', hoje).data).toBeNull();
    expect(analisarRecibo('TOTAL R$ 10,00\n15/12/2019', hoje).data).toBeNull();
  });
});
