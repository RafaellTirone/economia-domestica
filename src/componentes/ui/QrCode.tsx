import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

// QR Code desenhado no próprio aparelho (nenhum serviço externo). Nunca é salvo como imagem.
export function QrCode({ texto, tamanho = 220, rotulo }: { texto: string; tamanho?: number; rotulo: string }) {
  const { n, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const total = qr.getModuleCount();
    let d = '';
    for (let l = 0; l < total; l++) for (let c = 0; c < total; c++) if (qr.isDark(l, c)) d += `M${c + 4} ${l + 4}h1v1h-1z`;
    return { n: total + 8, caminho: d };
  }, [texto]);
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={rotulo} shapeRendering="crispEdges" className="rounded-xl bg-white">
      <rect width={n} height={n} fill="#FFFFFF" />
      <path d={caminho} fill="#1E1B2E" />
    </svg>
  );
}
