/**
 * Cálculo de datas — Onboarding Presencial (regra v3.1).
 *
 * Doc autoritativo: docs/decisoes/2026-05-22-regras-finais-calculators.md
 *
 * Substitui a regra v2 do commit 7b15462 (que mantinha o dia da criação
 * em todas as recorrentes, sem normalizar pro dia 01).
 *
 * Lógica:
 * 1. **Visita inicial (instalação):** `nextBusinessDay(contratoInicio)`.
 * 2. **Primeira recorrente:** calc = `firstDayOfNextMonth(contratoInicio)`,
 *    efetiva = `nextBusinessDay(calc)`. Se a efetiva colidir com a efetiva
 *    da inicial (caso típico: instalação 31/01 sáb → ef 02/02; primeira
 *    calc 01/02 dom → ef 02/02 = mesma data), avança 1 mês: calc =
 *    `firstDayOfNextMonth(calc)`, efetiva = `nextBusinessDay(calc)`.
 *    A descrição da OS pulada indica "data ajustada pra evitar colisão".
 * 3. **Demais recorrentes:** calc = `firstDayOfNextMonth(anterior_calc)`,
 *    efetiva = `nextBusinessDay(calc)`. Mensal até `contratoFim`.
 *
 * **Por que basear a primeira recorrente em `contratoInicio` (calc fixo) e
 * não na efetiva da inicial:** evita drift se o calendário de feriados mudar.
 * A data calculada agora depende apenas do contrato; só a efetiva move em
 * função de weekend/feriado. Recorrentes de clientes antigos não mudam
 * silenciosamente quando a tabela de feriados é atualizada.
 *
 * `dataCalculada` é preservada em cada OS pra auditoria.
 */
import type { OSToCreate } from '../lib/types.js';
import { nextBusinessDay } from './_business-day.js';
import { firstDayOfNextMonthUTC, formatDateUTC } from './_date.js';

const DESC_REGULAR = 'Visita técnica mensal';
const DESC_REGULAR_SKIP = 'Visita técnica mensal (data ajustada pra evitar colisão com instalação)';

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

  // 1. Visita inicial (instalação)
  const inicialEfetiva = await nextBusinessDay(contratoInicio);
  osList.push({
    tipo: 'visita_tecnica_inicial',
    data: formatDateUTC(inicialEfetiva),
    dataCalculada: formatDateUTC(contratoInicio),
    descricao: 'Visita técnica inicial (instalação)',
  });

  // 2. Primeira recorrente: dia 01 do mês seguinte ao contratoInicio.
  // Se a efetiva colidir com a efetiva da inicial, pula 1 mês.
  let calcRec = firstDayOfNextMonthUTC(contratoInicio);
  let efetRec = await nextBusinessDay(calcRec);
  let descricaoPrimeira = DESC_REGULAR;

  if (efetRec.getTime() === inicialEfetiva.getTime()) {
    calcRec = firstDayOfNextMonthUTC(calcRec);
    efetRec = await nextBusinessDay(calcRec);
    descricaoPrimeira = DESC_REGULAR_SKIP;
  }

  if (calcRec.getTime() <= contratoFim.getTime()) {
    osList.push({
      tipo: 'visita_tecnica_regular',
      data: formatDateUTC(efetRec),
      dataCalculada: formatDateUTC(calcRec),
      descricao: descricaoPrimeira,
    });

    // 3. Demais recorrentes
    let anteriorCalc = calcRec;
    while (true) {
      const proximaCalc = firstDayOfNextMonthUTC(anteriorCalc);
      if (proximaCalc.getTime() > contratoFim.getTime()) break;
      const proximaEfet = await nextBusinessDay(proximaCalc);
      osList.push({
        tipo: 'visita_tecnica_regular',
        data: formatDateUTC(proximaEfet),
        dataCalculada: formatDateUTC(proximaCalc),
        descricao: DESC_REGULAR,
      });
      anteriorCalc = proximaCalc;
    }
  }

  return osList;
}
