/**
 * Helpers de teste pros calculators.
 * Pré-popula o cache de feriados pra evitar HTTP em CI.
 */
import { _clearFeriadosCache, _setFeriadosForTest } from '../src/lib/feriados.js';

/**
 * Feriados nacionais BR + SP (Revolução 9/jul) pra 2024-2027.
 * Inclui móveis: Carnaval seg/ter, Sexta-Feira Santa, Corpus Christi.
 * Consciência Negra: 20/11 (nacional desde 2024).
 */
const FERIADOS: Record<number, string[]> = {
  2024: [
    '2024-01-01', '2024-02-12', '2024-02-13', '2024-03-29', '2024-04-21',
    '2024-05-01', '2024-05-30', '2024-07-09', '2024-09-07', '2024-10-12',
    '2024-11-02', '2024-11-15', '2024-11-20', '2024-12-25',
  ],
  2025: [
    '2025-01-01', '2025-03-03', '2025-03-04', '2025-04-18', '2025-04-21',
    '2025-05-01', '2025-06-19', '2025-07-09', '2025-09-07', '2025-10-12',
    '2025-11-02', '2025-11-15', '2025-11-20', '2025-12-25',
  ],
  2026: [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
    '2026-05-01', '2026-06-04', '2026-07-09', '2026-09-07', '2026-10-12',
    '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  ],
  2027: [
    '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21',
    '2027-05-01', '2027-05-27', '2027-07-09', '2027-09-07', '2027-10-12',
    '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
  ],
};

export function setupFeriados(): void {
  for (const [ano, dates] of Object.entries(FERIADOS)) {
    _setFeriadosForTest(Number(ano), dates);
  }
}

export function clearFeriados(): void {
  _clearFeriadosCache();
}

export const utc = (yyyymmdd: string): Date => new Date(`${yyyymmdd}T00:00:00Z`);
