import type { RegraSalario } from '../../utils/datas';
import { descreverRegraSalario, diaDoSalario, formatarData, hojeISO, partesDaData } from '../../utils/datas';

// Campo para cadastrar o dia do pagamento do salário (dia fixo, N-ésimo dia útil ou último dia útil).

export function EditorSalario({ valor, aoMudar, prefixo = 'salario' }: { valor: RegraSalario; aoMudar: (r: RegraSalario) => void; prefixo?: string }) {
  const { ano, mes } = partesDaData(hojeISO());
  const proxMes = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const exemplo = [diaDoSalario(ano, mes, valor), diaDoSalario(proxMes.ano, proxMes.mes, valor)].map(formatarData).join(' e ');
  const classe = 'min-h-12 rounded-xl border border-borda-forte bg-cartao px-3 text-base text-tinta';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${prefixo}-tipo`} className="sr-only">Como o salário é pago</label>
        <select id={`${prefixo}-tipo`} value={valor.tipo} className={`${classe} min-w-0 flex-1`}
          onChange={(e) => {
            const t = e.target.value as RegraSalario['tipo'];
            aoMudar(t === 'dia' ? { tipo: 'dia', dia: 5 } : t === 'dia-util' ? { tipo: 'dia-util', numero: 5 } : { tipo: 'ultimo-util' });
          }}>
          <option value="dia">Num dia fixo do mês</option>
          <option value="dia-util">No N-ésimo dia útil (ex.: 5º dia útil)</option>
          <option value="ultimo-util">No último dia útil do mês</option>
        </select>
        {valor.tipo === 'dia' && (
          <>
            <label htmlFor={`${prefixo}-dia`} className="sr-only">Dia do mês</label>
            <select id={`${prefixo}-dia`} value={valor.dia} onChange={(e) => aoMudar({ tipo: 'dia', dia: Number(e.target.value) })} className={`${classe} w-28`}>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>dia {i + 1}</option>)}
            </select>
          </>
        )}
        {valor.tipo === 'dia-util' && (
          <>
            <label htmlFor={`${prefixo}-numero`} className="sr-only">Qual dia útil</label>
            <select id={`${prefixo}-numero`} value={valor.numero} onChange={(e) => aoMudar({ tipo: 'dia-util', numero: Number(e.target.value) })} className={`${classe} w-36`}>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}º dia útil</option>)}
            </select>
          </>
        )}
      </div>
      <p className="m-0 text-sm text-suave" data-testid={`${prefixo}-exemplo`}>Salário {descreverRegraSalario(valor)}: cai em {exemplo}.{valor.tipo === 'dia-util' ? ' Pela CLT, sábado conta como dia útil.' : valor.tipo === 'dia' ? ' Se cair em fim de semana ou feriado, conta o dia útil anterior.' : ''}</p>
    </div>
  );
}
