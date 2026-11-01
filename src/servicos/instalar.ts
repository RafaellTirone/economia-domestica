import { useEffect, useState } from 'react';

// Instalar o app na tela de início do celular/computador.
// Android/Chrome/Edge: o navegador oferece o pedido de instalação (guardado aqui para o botão "Instalar").
// iPhone/iPad: o Safari não tem esse pedido — o app mostra o passo a passo (Compartilhar → Adicionar à Tela de Início).

interface PedidoInstalacao extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let pedido: PedidoInstalacao | null = null;
const ouvintes = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e as PedidoInstalacao; ouvintes.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { pedido = null; ouvintes.forEach((f) => f()); });
}

export type SituacaoInstalacao = 'instalado' | 'pode-instalar' | 'iphone' | 'outro';

export function situacaoInstalacao(): SituacaoInstalacao {
  if (typeof window === 'undefined') return 'outro';
  const instalado = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalado) return 'instalado';
  if (pedido) return 'pode-instalar';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  return 'outro';
}

export function useInstalacao() {
  const [situacao, setSituacao] = useState<SituacaoInstalacao>(situacaoInstalacao);
  useEffect(() => {
    const atualizar = () => setSituacao(situacaoInstalacao());
    ouvintes.add(atualizar);
    return () => { ouvintes.delete(atualizar); };
  }, []);
  async function instalar(): Promise<boolean> {
    if (!pedido) return false;
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    if (outcome === 'accepted') pedido = null;
    setSituacao(situacaoInstalacao());
    return outcome === 'accepted';
  }
  return { situacao, instalar };
}
