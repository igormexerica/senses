/**
 * Helpers de dia útil: pular weekend + feriado (regra do CS).
 */
import { isFeriado } from '../lib/feriados.js';
import { addDaysUTC, formatDateUTC } from './_date.js';

/** Sábado (6) ou Domingo (0) em UTC. */
export function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

export async function isBusinessDay(date: Date): Promise<boolean> {
  if (isWeekend(date)) return false;
  if (await isFeriado(formatDateUTC(date))) return false;
  return true;
}

/**
 * Avança até o próximo dia útil. Guard em 14 dias pra detectar bugs (ex: lista
 * de feriado errada que marca um mês inteiro).
 */
export async function nextBusinessDay(date: Date): Promise<Date> {
  let d = new Date(date);
  for (let i = 0; i < 14; i++) {
    if (await isBusinessDay(d)) return d;
    d = addDaysUTC(d, 1);
  }
  throw new Error(`nextBusinessDay: nenhum dia útil em 14 dias a partir de ${formatDateUTC(date)}`);
}

/** Primeiro dia do mês (UTC). Usado pela regra do dia 01 no Remoto. */
export function toFirstDayOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
