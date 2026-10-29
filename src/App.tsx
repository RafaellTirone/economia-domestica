import { Navigate, Route, Routes } from 'react-router-dom';
import { Estrutura } from './componentes/layout/Estrutura';
import { Configuracoes } from './paginas/Configuracoes';
import { EmConstrucao } from './paginas/EmConstrucao';
import { Inicio } from './paginas/Inicio';
import { Lancamentos } from './paginas/Lancamentos';
import { Lancar } from './paginas/Lancar';

// Rotas (telas) do app. As que ainda não existem mostram em qual etapa chegam.
export function App() {
  return (
    <Estrutura>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/lancar" element={<Lancar />} />
        <Route path="/lancar/:id" element={<Lancar />} />
        <Route path="/lancamentos" element={<Lancamentos />} />
        <Route path="/gastos" element={<Navigate to="/lancamentos" replace />} />
        <Route path="/dividas" element={<EmConstrucao titulo="Dívidas" etapa={5} descricao="Contratos de empréstimo, parcelas, juros do contrato e simulação de atraso e de quitação." />} />
        <Route path="/cofrinhos" element={<EmConstrucao titulo="Cofrinhos" etapa={9} descricao="Metas de economia com barra de progresso e o “Guardar agora” com Pix seguro." />} />
        <Route path="/desejos" element={<EmConstrucao titulo="Desejos" etapa={10} descricao="Intenções de compra: à vista ou parcelado, e em quanto tempo você consegue." />} />
        <Route path="/relatorios" element={<EmConstrucao titulo="Relatórios" etapa={11} descricao="Relatórios semanal, mensal e anual, com exportação em PDF e planilha." />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Estrutura>
  );
}
