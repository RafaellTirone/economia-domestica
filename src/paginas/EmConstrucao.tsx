import { Hammer } from 'lucide-react';

// Tela provisória das partes que chegam nas próximas etapas.
export function EmConstrucao({ titulo, etapa, descricao }: { titulo: string; etapa: number; descricao: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-2xl font-extrabold">{titulo}</h1>
      <div className="flex items-start gap-3 rounded-[22px] border border-borda bg-cartao p-5">
        <Hammer size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-primaria" />
        <div>
          <p className="m-0 font-bold">Em construção — chega na etapa {etapa}.</p>
          <p className="m-0 mt-1 text-sm text-suave">{descricao}</p>
        </div>
      </div>
    </div>
  );
}
