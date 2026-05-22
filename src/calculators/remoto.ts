/**
 * Cálculo de datas — Onboarding Remoto (regra v3).
 *
 * Doc autoritativo: docs/decisoes/2026-05-22-regras-finais-calculators.md
 *
 * Substitui a regra v2 do commit 7b15462 (que aplicava dia 01 a tudo).
 *
 * Lógica:
 * 1. **Inicial:** `nextBusinessDay(contratoInicio)`. SEM dia 01.
 * 2. **Equalização** (somente se mês de fechamento é PAR):
 *    - calc = `contratoInicio + 1 mês` (via clamp, próximo mês = ímpar)
 *    - efetiva = `nextBusinessDay(calc)`
 *    - descrição enriquecida com aviso ⚠️ pra CS conferir qtde reduzida.
 * 3. **Recorrentes** (a cada 2 meses, no dia do fechamento):
 *    - Mês ímpar → âncora = `contratoInicio`
 *    - Mês par   → âncora = `contratoInicio + 1 mês` (= calc da equalização)
 *    - Sequência: âncora + 2N meses (N=1,2,3...) via `addMonthsClampedUTC`
 *      pra preservar dia 31 nos meses longos (jan 31 → mar 31 → mai 31 →
 *      jul 31 → set 30 clamp → nov 30 clamp → jan 31 de novo).
 *    - Cada via `nextBusinessDay`.
 *
 * Quantidade de refil NÃO é modelada — CS gerencia no Field.
 *
 * `dataCalculada` é preservada em cada OS pra auditoria no Supabase.
 */
import type { OSToCreate } from '../lib/types.js';
import { nextBusinessDay } from './_business-day.js';
import { addMonthsClampedUTC, formatDateUTC } from './_date.js';

/** Descrição EXATA da equalização (CS depende desse texto pra triagem). */
const DESC_EQUALIZACAO =
  '⚠️ EQUALIZAÇÃO — Cliente iniciou em mês par. Conferir qtde reduzida com CS.';

export interface CalcularRemotoInput {
  contratoInicio: Date;
  contratoFim: Date;
}

export async function calcularDatasRemoto({
  contratoInicio,
  contratoFim,
}: CalcularRemotoInput): Promise<OSToCreate[]> {
  if (contratoFim.getTime() < contratoInicio.getTime()) {
    throw new Error('contratoFim deve ser >= contratoInicio');
  }

  const ehImpar = (contratoInicio.getUTCMonth() + 1) % 2 === 1;
  const osList: OSToCreate[] = [];

  // 1. Inicial — sempre na data do fechamento (via dia útil)
  osList.push(
    await buildOs('envio_refil_inicial', contratoInicio, 'Envio inicial (conclusão do onboarding)'),
  );

  // 2. Equalização (mês par) — define a âncora pras recorrentes
  let ancora: Date;
  if (ehImpar) {
    ancora = contratoInicio;
  } else {
    const equalizacao = addMonthsClampedUTC(contratoInicio, 1);
    osList.push(await buildOs('envio_refil_equalizacao', equalizacao, DESC_EQUALIZACAO));
    ancora = equalizacao;
  }

  // 3. Recorrentes — âncora + 2N meses (preserva dia 31 via clamp)
  let mesesAdiante = 2;
  let proximaCalc = addMonthsClampedUTC(ancora, mesesAdiante);
  while (proximaCalc.getTime() <= contratoFim.getTime()) {
    osList.push(await buildOs('envio_refil_regular', proximaCalc, 'Envio de refil recorrente'));
    mesesAdiante += 2;
    proximaCalc = addMonthsClampedUTC(ancora, mesesAdiante);
  }

  return osList;
}

async function buildOs(
  tipo: OSToCreate['tipo'],
  dataCalculada: Date,
  descricao: string,
): Promise<OSToCreate> {
  const efetiva = await nextBusinessDay(dataCalculada);
  return {
    tipo,
    data: formatDateUTC(efetiva),
    dataCalculada: formatDateUTC(dataCalculada),
    descricao,
  };
}
