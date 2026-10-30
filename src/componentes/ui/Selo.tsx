import { useEffect, useState } from 'react';
import { seloDaChave, type SimboloSelo } from '../../servicos/pix';

// Selo de segurança: 3 símbolos que sempre se repetem para a mesma chave.
// Se a combinação mudar, a chave foi trocada.

const FORMAS: Record<SimboloSelo['forma'], string> = {
  triângulo: 'M12 3 21 20H3z',
  círculo: 'M12 3a9 9 0 1 0 0.01 0z',
  quadrado: 'M4 4h16v16H4z',
  losango: 'M12 2 22 12 12 22 2 12z',
  estrela: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z',
  hexágono: 'M7 3h10l5 9-5 9H7l-5-9z',
};

export function Selo({ chave, tamanho = 24 }: { chave: string; tamanho?: number }) {
  const [simbolos, setSimbolos] = useState<SimboloSelo[] | null>(null);
  useEffect(() => { void seloDaChave(chave).then(setSimbolos); }, [chave]);
  if (!simbolos) return null;
  const descricao = simbolos.map((s) => `${s.forma} ${s.cor.nome}`).join(', ');
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Selo de segurança: ${descricao}`} data-testid="selo" data-selo={descricao}>
      {simbolos.map((s, i) => (
        <svg key={i} width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true"><path d={FORMAS[s.forma]} fill={s.cor.hex} /></svg>
      ))}
    </span>
  );
}
