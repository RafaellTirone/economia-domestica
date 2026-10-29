import type { Categoria } from '../tipos';

// Categorias que já vêm prontas no app, com as contas de uma casa comum.
// As cores seguem uma paleta testada para daltonismo; o usuário pode trocar depois.

type Modelo = Omit<Categoria, 'id' | 'ordem' | 'padrao' | 'limiteMensal' | 'subcategorias'> & { subcategorias: string[] };

/** Gera um id simples e estável para a subcategoria a partir do nome ("Compra do mês" → "compra-do-mes"). */
export function idDeSubcategoria(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const modelos: Modelo[] = [
  // ---- Despesas ----
  { nome: 'Moradia', cor: '#2a78d6', icone: 'casa', tipo: 'despesa', subcategorias: ['Aluguel / financiamento', 'Condomínio', 'IPTU', 'Manutenção e reparos', 'Móveis e utensílios'] },
  { nome: 'Alimentação', cor: '#eb6834', icone: 'carrinho', tipo: 'despesa', subcategorias: ['Compra do mês', 'Feira / hortifrúti', 'Açougue', 'Padaria', 'Delivery', 'Restaurante'] },
  { nome: 'Transporte', cor: '#1baf7a', icone: 'carro', tipo: 'despesa', subcategorias: ['Combustível', 'Ônibus / metrô / app', 'Manutenção do veículo', 'IPVA e licenciamento', 'Seguro do veículo', 'Estacionamento / pedágio'] },
  { nome: 'Contas da casa', cor: '#eda100', icone: 'raio', tipo: 'despesa', subcategorias: ['Luz', 'Água', 'Gás', 'Internet', 'Celular', 'TV / streaming'] },
  { nome: 'Dívidas', cor: '#e87ba4', icone: 'banco', tipo: 'despesa', subcategorias: ['Parcela de empréstimo', 'Cartão parcelado', 'Juros e multas'] },
  { nome: 'Saúde', cor: '#008300', icone: 'saude', tipo: 'despesa', subcategorias: ['Plano de saúde', 'Farmácia', 'Consultas e exames', 'Dentista', 'Academia'] },
  { nome: 'Educação', cor: '#e34948', icone: 'livro', tipo: 'despesa', subcategorias: ['Escola / faculdade', 'Material escolar', 'Cursos'] },
  { nome: 'Lazer', cor: '#6250d6', icone: 'lazer', tipo: 'despesa', subcategorias: ['Passeios', 'Viagens', 'Assinaturas', 'Bares e festas'] },
  { nome: 'Casa e higiene', cor: '#8a8984', icone: 'limpeza', tipo: 'despesa', subcategorias: ['Produtos de limpeza', 'Higiene pessoal', 'Pet'] },
  { nome: 'Vestuário', cor: '#6b6a66', icone: 'camiseta', tipo: 'despesa', subcategorias: ['Roupas', 'Calçados', 'Acessórios'] },
  { nome: 'Outros', cor: '#a8a59e', icone: 'caixa', tipo: 'despesa', subcategorias: ['Presentes', 'Doações', 'Imprevistos'] },
  // ---- Receitas ----
  { nome: 'Salário', cor: '#2a78d6', icone: 'maleta', tipo: 'receita', subcategorias: ['Salário', '13º salário', 'Férias'] },
  { nome: 'Renda extra', cor: '#1baf7a', icone: 'brilho', tipo: 'receita', subcategorias: ['Bicos / freelas', 'Vendas', 'Aluguel recebido'] },
  { nome: 'Outras receitas', cor: '#a8a59e', icone: 'moedas', tipo: 'receita', subcategorias: ['Reembolsos', 'Presentes recebidos', 'Rendimentos'] },
];

/** Lista pronta para gravar no banco na primeira vez que o app abre. */
export function categoriasPadrao(): Categoria[] {
  return modelos.map((m, i) => ({
    ...m,
    subcategorias: m.subcategorias.map((nome) => ({ id: idDeSubcategoria(nome), nome })),
    limiteMensal: null,
    padrao: true,
    ordem: i,
  }));
}
