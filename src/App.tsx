import { Route, Routes } from 'react-router-dom';
import { Estrutura } from './componentes/layout/Estrutura';
import { Configuracoes } from './paginas/Configuracoes';
import { EmConstrucao } from './paginas/EmConstrucao';
import { Inicio } from './paginas/Inicio';

// Rotas (telas) do app. As que ainda não existem mostram em qual etapa chegam.
export function App() {
  return (
    <Estrutura>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/lancar" element={<EmConstrucao titulo="Novo lançamento" etapa={2} descricao="Cadastrar receitas e despesas em poucos toques: escolha o envelope, digite o valor e salve." />} />
        <Route path="/gastos" element={<EmConstrucao titulo="Gastos" etapa={2} descricao="Lista de lançamentos com busca e filtros por período, categoria e tipo." />} />
        <Route path="/dividas" element={<EmConstrucao titulo="Dívidas" etapa={5} descricao="Contratos de empréstimo, parcelas, juros do contrato e simulação de atraso e de quitação." />} />
        <Route path="/cofrinhos" element={<EmConstrucao titulo="Cofrinhos" etapa={9} descricao="Metas de economia com barra de progresso e o “Guardar agora” com Pix seguro." />} />
        <Route path="/desejos" element={<EmConstrucao titulo="Desejos" etapa={10} descricao="Intenções de compra: à vista ou parcelado, e em quanto tempo você consegue." />} />
        <Route path="/relatorios" element={<EmConstrucao titulo="Relatórios" etapa={11} descricao="Relatórios semanal, mensal e anual, com exportação em PDF e planilha." />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<EmConstrucao titulo="Página não encontrada" etapa={1} descricao="Use o menu para voltar ao início." />} />
      </Routes>
    </Estrutura>
  );
}
