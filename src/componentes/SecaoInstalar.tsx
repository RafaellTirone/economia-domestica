import { CheckCircle2, Download, Share, SquarePlus } from 'lucide-react';
import { useInstalacao } from '../servicos/instalar';

// Instalar o app: ícone na tela de início, abre como aplicativo, funciona sem internet
// e, no iPhone, protege os dados (o Safari apaga dados de sites não usados por 7 dias).

export function SecaoInstalar() {
  const { situacao, instalar } = useInstalacao();
  return (
    <section aria-labelledby="titulo-instalar" className="flex flex-col gap-3 rounded-[22px] border border-borda bg-cartao p-5" data-testid="secao-instalar" data-situacao={situacao}>
      <h2 id="titulo-instalar" className="m-0 text-lg font-extrabold">Instalar o app no celular</h2>
      {situacao === 'instalado' && (
        <p className="m-0 flex items-center gap-2 font-bold text-ok-texto"><CheckCircle2 size={20} aria-hidden="true" />App instalado. Ele abre pelo ícone e funciona sem internet.</p>
      )}
      {situacao === 'pode-instalar' && (
        <>
          <p className="m-0 text-sm text-suave">Coloca o ícone na tela de início, abre como aplicativo e funciona sem internet.</p>
          <button type="button" onClick={() => void instalar()} className="flex min-h-12 items-center gap-2 self-start rounded-xl bg-primaria px-4 font-extrabold text-white"><Download size={18} aria-hidden="true" />Instalar o app</button>
        </>
      )}
      {situacao === 'iphone' && (
        <>
          <p className="m-0 text-sm"><strong>No iPhone, instalar é importante:</strong> o Safari pode apagar os dados de sites que ficam 7 dias sem uso. Instalado na tela de início, o app fica protegido.</p>
          <ol className="m-0 flex flex-col gap-2 pl-5 text-[15px]" data-testid="passos-iphone">
            <li>No Safari, toque em <Share size={16} aria-label="Compartilhar" className="inline align-text-bottom" /> <strong>Compartilhar</strong> (embaixo, no meio).</li>
            <li>Role e toque em <SquarePlus size={16} aria-hidden="true" className="inline align-text-bottom" /> <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Toque em <strong>Adicionar</strong>. Depois, abra sempre pelo ícone <strong>Nosso Dinheiro</strong>.</li>
          </ol>
          <p className="m-0 text-xs text-suave">Os dados do Safari e os do app instalado ficam separados: se já lançou coisas no Safari, faça um backup e restaure no app instalado.</p>
        </>
      )}
      {situacao === 'outro' && (
        <p className="m-0 text-sm text-suave">No celular Android, abra no Chrome: aparece a opção “Instalar app” (ou no menu ⋮ → “Instalar app”). No iPhone, use o Safari → Compartilhar → “Adicionar à Tela de Início”.</p>
      )}
    </section>
  );
}
