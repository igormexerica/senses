/**
 * Cálculo de datas — Onboarding Presencial.
 * Spec: integracao-clint-field-senses.md § 5 + regras CS confirmadas 2026-05-22.
 *
 * Lógica de cálculo:
 * - Visita inicial na data do contrato.
 * - Próximas visitas mensais ancoradas no dia do contrato (não vai pro dia 01).
 * - Quando o dia não existe no mês alvo (ex: 31 em fev), desliza pro último dia
 *   do mês via clamp. Anchor preservado: jan 31 → fev 28 → mar 31 → abr 30.
 *
 * Regra CS aplicada sobre cada data calculada:
 * - Se cair em sábado/domingo/feriado, avançar pro próximo dia útil.
 *   (Diferente do Remoto: presencial NÃO normaliza pro dia 01.)
 *
 * `dataCalculada` é preservada em cada OS pra auditoria.
 */
import type { OSToCreate } from '../lib/types.js';
import { nextBusinessDay } from './_business-day.js';
import { addMonthsClampedUTC, formatDateUTC } from './_date.js';

export interface CalcularPresencialInput {
  contratoInicio: Date;
  contratoFim: Date;
}

export async function calcularDatasPresencial({
  contratoInicio,
  contratoFim,
}: CalcularPresencialInput): Promise<OSToCreate[]> {
  if (contratoFim.getTime() < contratoInicio.getTime()) {
    throw new Error('contratoFim deve ser >= contratoInicio');
  }

  const osList: OSToCreate[] = [];
  const diaAncoragem = contratoInicio.getUTCDate();

  osList.push(
    await buildOs(
      'visita_tecnica_inicial',
      contratoInicio,
      'Visita técnica inicial (conclusão do onboarding presencial)',
      diaAncoragem,
    ),
  );

  // Ancorar sempre na data original + N meses pra preservar o dia da ancoragem
  // nos meses longos (jan 31 → fev 28 → mar 31, não fev 28 → mar 28).
  let mesesAdiante = 1;
  let proxima = addMonthsClampedUTC(contratoInicio, mesesAdiante);
  while (proxima.getTime() <= contratoFim.getTime()) {
    osList.push(
      await buildOs(
        'visita_tecnica_regular',
        proxima,
        descRegular(diaAncoragem, proxima.getUTCDate()),
        diaAncoragem,
      ),
    );
    mesesAdiante += 1;
    proxima = addMonthsClampedUTC(contratoInicio, mesesAdiante);
  }

  return osList;
}

function descRegular(diaAncoragem: number, diaResultante: number): string {
  return diaResultante !== diaAncoragem
    ? `Visita técnica mensal (dia ajustado de ${diaAncoragem} para ${diaResultante})`
    : 'Visita técnica mensal';
}

async function buildOs(
  tipo: OSToCreate['tipo'],
  dataCalculada: Date,
  descricao: string,
  _diaAncoragem: number,
): Promise<OSToCreate> {
  const efetiva = await nextBusinessDay(dataCalculada);
  return {
    tipo,
    data: formatDateUTC(efetiva),
    dataCalculada: formatDateUTC(dataCalculada),
    descricao,
  };
}
