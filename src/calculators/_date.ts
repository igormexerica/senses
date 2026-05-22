/**
 * Helpers de data 100% UTC.
 *
 * Por que UTC: todas as datas do contrato chegam como 'YYYY-MM-DD' (date-only,
 * sem timezone). Usar UTC evita que TZ do servidor cause deslocamento de um dia
 * (clássica armadilha do JS Date com horários "locais").
 */

/** Formata Date como 'YYYY-MM-DD' usando componentes UTC. */
export function formatDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Adiciona dias mantendo a aritmética em UTC. */
export function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

/**
 * Adiciona meses com **clamp ao último dia do mês alvo**.
 *
 * Resolve o bug clássico do JS: `setMonth(+1)` em Jan 31 estoura pra Mar 3
 * (Feb 31 não existe → overflow). Aqui Jan 31 → Feb 28 (ou 29 em ano bissexto).
 * Necessário pro presencial onde a "ancoragem" mantém o dia 31 quando possível
 * e desliza só nos meses curtos.
 */
export function addMonthsClampedUTC(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  // Dia 0 do mês (month+1) = último dia do mês alvo
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(year, month, clampedDay));
}

/** Primeiro dia do mês seguinte (usado pra "próximo mês ímpar" no remoto par). */
export function firstDayOfNextMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
