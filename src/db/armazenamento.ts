// Proteção contra perda de dados: pede ao navegador para NÃO apagar os dados do app
// quando o aparelho estiver com pouco espaço (ou, no iPhone, após dias sem uso).

export type SituacaoArmazenamento = 'protegido' | 'nao-protegido' | 'indisponivel';

export async function pedirArmazenamentoPersistente(): Promise<SituacaoArmazenamento> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'indisponivel';
  try {
    if (await navigator.storage.persisted()) return 'protegido';
    return (await navigator.storage.persist()) ? 'protegido' : 'nao-protegido';
  } catch {
    return 'indisponivel';
  }
}

export async function situacaoArmazenamento(): Promise<SituacaoArmazenamento> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'indisponivel';
  try {
    return (await navigator.storage.persisted()) ? 'protegido' : 'nao-protegido';
  } catch {
    return 'indisponivel';
  }
}
