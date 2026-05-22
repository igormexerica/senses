/**
 * Cálculo de datas — Onboarding Presencial.
 * Spec: integracao-clint-field-senses.md § 5.
 *
 * Regras:
 * - Visita inicial na data do contrato.
 * - Próximas visitas mensais ancoradas no dia do contrato.
 * - Quando o dia não existe no mês alvo (ex: dia 31 em fevereiro), desliza pro
 *   último dia do mês. A ancoragem é preservada: nos meses seguintes que têm o
 *   dia original, volta pra ele (Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31...).
 *
 * Nota: o pseudo-código da spec usa `setMonth(+1)` direto que tem o bug de
 * overflow do JS (Jan 31 vira Mar 3). Aqui usamos `addMonthsClampedUTC` que
 * respeita a semântica documentada de "deslize natural".
 */
import type { OSToCreate } from '../lib/types.js';
import { addMonthsClampedUTC, formatDateUTC } from './_date.js';

export interface CalcularPresencialInput {
  contratoInicio: Date;
  contratoFim: Date;
}

export function calcularDatasPresencial({
  contratoInicio,
  contratoFim,
}: CalcularPresencialInput): OSToCreate[] {
  if (contratoFim.getTime() < contratoInicio.getTime()) {
    throw new Error('contratoFim deve ser >= contratoInicio');
  }

  const osList: OSToCreate[] = [];
  const diaAncoragem = contratoInicio.getUTCDate();

  osList.push({
    tipo: 'visita_tecnica_inicial',
    data: formatDateUTC(contratoInicio),
    descricao: 'Visita técnica inicial (conclusão do onboarding presencial)',
  });

  // Ancorar sempre na data original + N meses, não no resultado da iteração anterior.
  // Isso garante que dia 31 → fev 28 → mar 31 (volta) → abr 30 → mai 31 ...
  let mesesAdiante = 1;
  let proxima = addMonthsClampedUTC(contratoInicio, mesesAdiante);

  while (proxima.getTime() <= contratoFim.getTime()) {
    const diaResultante = proxima.getUTCDate();
    const deslizou = diaResultante !== diaAncoragem;
    osList.push({
      tipo: 'visita_tecnica_regular',
      data: formatDateUTC(proxima),
      descricao: deslizou
        ? `Visita técnica mensal (dia ajustado de ${diaAncoragem} para ${diaResultante})`
        : 'Visita técnica mensal',
    });
    mesesAdiante += 1;
    proxima = addMonthsClampedUTC(contratoInicio, mesesAdiante);
  }

  return osList;
}
