/**
 * Cálculo de datas — Onboarding Remoto.
 * Spec: integracao-clint-field-senses.md § 4.
 *
 * Regras:
 * - Mês ímpar: primeiro envio na data do contrato (já entra no "calendário ímpar").
 * - Mês par:   gera DUAS OS — envio inicial na data do contrato + equalização no
 *              dia 1º do próximo mês (que é ímpar). Pendência A resolvida: manter
 *              as duas OS.
 * - A partir do primeiro envio "no calendário ímpar", +60d até contratoFim.
 */
import type { OSToCreate } from '../lib/types.js';
import { addDaysUTC, firstDayOfNextMonthUTC, formatDateUTC } from './_date.js';

export interface CalcularRemotoInput {
  contratoInicio: Date;
  contratoFim: Date;
}

export function calcularDatasRemoto({ contratoInicio, contratoFim }: CalcularRemotoInput): OSToCreate[] {
  if (contratoFim.getTime() < contratoInicio.getTime()) {
    throw new Error('contratoFim deve ser >= contratoInicio');
  }

  const osList: OSToCreate[] = [];
  const mesInicio1Based = contratoInicio.getUTCMonth() + 1;
  const ehImpar = mesInicio1Based % 2 === 1;

  osList.push({
    tipo: 'envio_refil_inicial',
    data: formatDateUTC(contratoInicio),
    descricao: 'Envio inicial (conclusão do onboarding)',
  });

  let dataPrimeiroEnvio: Date;
  if (ehImpar) {
    dataPrimeiroEnvio = contratoInicio;
  } else {
    const proximoImpar = firstDayOfNextMonthUTC(contratoInicio);
    osList.push({
      tipo: 'envio_refil_equalizacao',
      data: formatDateUTC(proximoImpar),
      descricao: 'Envio de equalização (entrada no calendário ímpar)',
    });
    dataPrimeiroEnvio = proximoImpar;
  }

  let proxima = addDaysUTC(dataPrimeiroEnvio, 60);
  while (proxima.getTime() <= contratoFim.getTime()) {
    osList.push({
      tipo: 'envio_refil_regular',
      data: formatDateUTC(proxima),
      descricao: 'Envio de refil recorrente',
    });
    proxima = addDaysUTC(proxima, 60);
  }

  return osList;
}
