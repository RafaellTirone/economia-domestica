import '@fontsource-variable/manrope';
import './estilos.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { pedirArmazenamentoPersistente } from './db/armazenamento';
import { ProvedorMes } from './hooks/useMes';

// Ponto de entrada do app.

// Pede ao navegador para não apagar os dados do app (proteção contra perda de dados).
void pedirArmazenamentoPersistente();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorMes>
        <App />
      </ProvedorMes>
    </BrowserRouter>
  </StrictMode>,
);
