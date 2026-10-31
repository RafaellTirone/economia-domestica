import { Navigate, Route, Routes } from 'react-router-dom';
import { Estrutura } from './componentes/layout/Estrutura';
import { CadastroPix } from './paginas/CadastroPix';
import { CategoriaForm } from './paginas/CategoriaForm';
import { Categorias } from './paginas/Categorias';
import { Orcamento } from './paginas/Orcamento';
import { CofrinhoDetalhe } from './paginas/CofrinhoDetalhe';
import { CofrinhoForm } from './paginas/CofrinhoForm';
import { Cofrinhos } from './paginas/Cofrinhos';
import { Configuracoes } from './paginas/Configuracoes';
import { DesejoForm } from './paginas/DesejoForm';
import { Desejos } from './paginas/Desejos';
import { GuardarPix } from './paginas/GuardarPix';
import { Relatorios } from './paginas/Relatorios';
import { Dividas } from './paginas/Dividas';
import { EmprestimoDetalhe } from './paginas/EmprestimoDetalhe';
import { EmprestimoForm } from './paginas/EmprestimoForm';
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
        <Route path="/dividas" element={<Dividas />} />
        <Route path="/dividas/novo" element={<EmprestimoForm />} />
        <Route path="/dividas/:id" element={<EmprestimoDetalhe />} />
        <Route path="/dividas/:id/editar" element={<EmprestimoForm />} />
        <Route path="/cofrinhos" element={<Cofrinhos />} />
        <Route path="/cofrinhos/novo" element={<CofrinhoForm />} />
        <Route path="/cofrinhos/pix" element={<CadastroPix />} />
        <Route path="/cofrinhos/:id" element={<CofrinhoDetalhe />} />
        <Route path="/cofrinhos/:id/editar" element={<CofrinhoForm />} />
        <Route path="/cofrinhos/:id/guardar" element={<GuardarPix />} />
        <Route path="/desejos" element={<Desejos />} />
        <Route path="/desejos/novo" element={<DesejoForm />} />
        <Route path="/desejos/:id/editar" element={<DesejoForm />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/orcamento" element={<Orcamento />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/categorias/nova" element={<CategoriaForm />} />
        <Route path="/categorias/:id" element={<CategoriaForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Estrutura>
  );
}
