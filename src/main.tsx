import '@fontsource-variable/manrope';
import './estilos.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { App } from './App';
import { pedirArmazenamentoPersistente } from './db/armazenamento';
import { ProvedorAvisos } from './hooks/useAvisos';
import { ProvedorMes } from './hooks/useMes';

// Ponto de entrada do app.

// Pede ao navegador para não apagar os dados do app (proteção contra perda de dados).
void pedirArmazenamentoPersistente();

// A versão de teste (publicada como página única) usa endereços com # para funcionar dentro de outra página.
const Roteador = import.meta.env.VITE_ROTEADOR === 'hash' ? HashRouter : BrowserRouter;

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Roteador>
      <ProvedorMes>
        <ProvedorAvisos>
          <App />
        </ProvedorAvisos>
      </ProvedorMes>
    </Roteador>
  </StrictMode>,
);
