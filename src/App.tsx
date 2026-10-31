import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Estrutura } from './componentes/layout/Estrutura';
import { Inicio } from './paginas/Inicio';
import { Lancar } from './paginas/Lancar';
import { useMes } from './hooks/useMes';
import { gerarContasFixas } from './servicos/recorrencias';
import { gerarDescontosConsignado } from './servicos/emprestimos';
import { avisarAoAbrir, carregarEventos, textoDoAviso } from './servicos/lembretes';

// Telas carregadas só quando abertas (o app abre mais rápido); Visão geral e Lançar vêm prontas.
const CadastroPix = lazy(() => import('./paginas/CadastroPix').then((m) => ({ default: m.CadastroPix })));
const CategoriaForm = lazy(() => import('./paginas/CategoriaForm').then((m) => ({ default: m.CategoriaForm })));
const Categorias = lazy(() => import('./paginas/Categorias').then((m) => ({ default: m.Categorias })));
const Orcamento = lazy(() => import('./paginas/Orcamento').then((m) => ({ default: m.Orcamento })));
const CofrinhoDetalhe = lazy(() => import('./paginas/CofrinhoDetalhe').then((m) => ({ default: m.CofrinhoDetalhe })));
const CofrinhoForm = lazy(() => import('./paginas/CofrinhoForm').then((m) => ({ default: m.CofrinhoForm })));
const Cofrinhos = lazy(() => import('./paginas/Cofrinhos').then((m) => ({ default: m.Cofrinhos })));
const Configuracoes = lazy(() => import('./paginas/Configuracoes').then((m) => ({ default: m.Configuracoes })));
const DesejoForm = lazy(() => import('./paginas/DesejoForm').then((m) => ({ default: m.DesejoForm })));
const Desejos = lazy(() => import('./paginas/Desejos').then((m) => ({ default: m.Desejos })));
const GuardarPix = lazy(() => import('./paginas/GuardarPix').then((m) => ({ default: m.GuardarPix })));
const Relatorios = lazy(() => import('./paginas/Relatorios').then((m) => ({ default: m.Relatorios })));
const Dividas = lazy(() => import('./paginas/Dividas').then((m) => ({ default: m.Dividas })));
const EmprestimoDetalhe = lazy(() => import('./paginas/EmprestimoDetalhe').then((m) => ({ default: m.EmprestimoDetalhe })));
const EmprestimoForm = lazy(() => import('./paginas/EmprestimoForm').then((m) => ({ default: m.EmprestimoForm })));
const Lancamentos = lazy(() => import('./paginas/Lancamentos').then((m) => ({ default: m.Lancamentos })));
const ContasDoMes = lazy(() => import('./paginas/ContasDoMes').then((m) => ({ default: m.ContasDoMes })));

// Rotas (telas) do app. As que ainda não existem mostram em qual etapa chegam.
export function App() {
  // Ao abrir o app e na virada do dia: cria as contas que se repetem (do mês e do próximo)
  // e lança as parcelas de consignado descontadas do salário bruto; depois, o aviso do dia
  const { hoje } = useMes();
  useEffect(() => {
    void (async () => {
      await gerarContasFixas(hoje);
      await gerarDescontosConsignado(hoje);
      // Aviso do dia (se a pessoa ligou em Configurações e o navegador permite)
      const { eventos, atrasadas } = await carregarEventos(hoje);
      await avisarAoAbrir(hoje, textoDoAviso(eventos, atrasadas, hoje));
    })();
  }, [hoje]);
  return (
    <Estrutura>
      <Suspense fallback={<p className="text-suave">Carregando…</p>}>
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
        <Route path="/contas" element={<ContasDoMes />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/categorias/nova" element={<CategoriaForm />} />
        <Route path="/categorias/:id" element={<CategoriaForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Estrutura>
  );
}
