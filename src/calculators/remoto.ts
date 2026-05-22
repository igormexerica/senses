/**
 * Cálculo de datas — Onboarding Remoto.
 * Spec: integracao-clint-field-senses.md § 4 + regras CS confirmadas 2026-05-22.
 *
 * Lógica de cálculo:
 * - Mês ímpar: primeiro envio na data do contrato (calendário ímpar).
 * - Mês par:   gera DUAS OS — envio inicial na data do contrato + equalização
 *              no dia 1º do próximo mês (ímpar). Pendência A: confirmada.
 * - A partir do primeiro envio "no calendário ímpar", +60d até contratoFim.
 *
 * Regras CS aplicadas sobre cada data calculada:
 * 1. Normalizar pro dia 01 do mês (regra de logística — envio de refil não
 *    precisa de dia exato, CS organiza a expedição no início do mês).
 * 2. Se cair em sábado/domingo/feriado, avançar pro próximo dia útil.
 *
 * `dataCalculada` é preservada em cada OS pra auditoria no log do Supabase.
 */
import type { OSToCreate } from '../lib/types.js';
import { nextBusinessDay, toFirstDayOfMonthUTC } from './_business-day.js';
import { addDaysUTC, firstDayOfNextMonthUTC, formatDateUTC } from './_date.js';

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

  const osList: OSToCreate[] = [];
  const mesInicio1Based = contratoInicio.getUTCMonth() + 1;
  const ehImpar = mesInicio1Based % 2 === 1;

  osList.push(
    await buildOs('envio_refil_inicial', contratoInicio, 'Envio inicial (conclusão do onboarding)'),
  );

  let dataPrimeiroEnvio: Date;
  if (ehImpar) {
    dataPrimeiroEnvio = contratoInicio;
  } else {
    const proximoImpar = firstDayOfNextMonthUTC(contratoInicio);
    osList.push(
      await buildOs(
        'envio_refil_equalizacao',
        proximoImpar,
        'Envio de equalização (entrada no calendário ímpar)',
      ),
    );
    dataPrimeiroEnvio = proximoImpar;
  }

  let proxima = addDaysUTC(dataPrimeiroEnvio, 60);
  while (proxima.getTime() <= contratoFim.getTime()) {
    osList.push(await buildOs('envio_refil_regular', proxima, 'Envio de refil recorrente'));
    proxima = addDaysUTC(proxima, 60);
  }

  return osList;
}

async function buildOs(
  tipo: OSToCreate['tipo'],
  dataCalculada: Date,
  descricao: string,
): Promise<OSToCreate> {
  // 1. Normaliza pro dia 01 do mês (regra do CS pro Remoto)
  // 2. Ajusta pro próximo dia útil
  const diaUm = toFirstDayOfMonthUTC(dataCalculada);
  const efetiva = await nextBusinessDay(diaUm);
  return {
    tipo,
    data: formatDateUTC(efetiva),
    dataCalculada: formatDateUTC(dataCalculada),
    descricao,
  };
}
