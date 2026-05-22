/**
 * Feriados nacionais (BrasilAPI) + estaduais SP + municipais Rio Claro.
 * Usado pelo helper de dia útil pra deslocar OS que cairiam em feriado.
 *
 * BrasilAPI já cobre nacionais + móveis (Carnaval, Sexta-Feira Santa, Corpus Christi).
 * Listas extras abaixo são fixas em (MM-DD), aplicadas ao ano consultado.
 */
import axios from 'axios';

const cache = new Map<number, Set<string>>();

/**
 * Feriado estadual SP: Revolução Constitucionalista (09/07).
 * Consciência Negra (20/11) virou feriado nacional em 2024 — já vem da BrasilAPI.
 */
const FERIADOS_SP_EXTRA_MMDD: string[] = ['07-09'];

/**
 * Feriados municipais de Rio Claro/SP.
 * TODO: confirmar lista com o usuário. Candidatos comuns:
 *   - Aniversário da cidade (data fundação — confirmar)
 *   - São João Batista (24/06) — padroeira (confirmar)
 * Por ora vazio — usuário pode preencher e o cache renova no próximo carregamento.
 */
const FERIADOS_RIO_CLARO_EXTRA_MMDD: string[] = [];

interface BrasilApiFeriado {
  date: string; // 'YYYY-MM-DD'
  name: string;
  type: string;
}

export async function getFeriados(ano: number): Promise<Set<string>> {
  const hit = cache.get(ano);
  if (hit) return hit;

  const res = await axios.get<BrasilApiFeriado[]>(
    `https://brasilapi.com.br/api/feriados/v1/${ano}`,
    { timeout: 10_000 },
  );

  const set = new Set<string>(res.data.map((f) => f.date));
  for (const mmdd of FERIADOS_SP_EXTRA_MMDD) set.add(`${ano}-${mmdd}`);
  for (const mmdd of FERIADOS_RIO_CLARO_EXTRA_MMDD) set.add(`${ano}-${mmdd}`);

  cache.set(ano, set);
  return set;
}

export async function isFeriado(yyyymmdd: string): Promise<boolean> {
  const ano = Number(yyyymmdd.slice(0, 4));
  const feriados = await getFeriados(ano);
  return feriados.has(yyyymmdd);
}

// ─────────────────────────────────────────────────────────────
// Helpers de teste — evita chamadas HTTP em vitest.
// Prefixo `_` indica uso restrito (não API pública).
// ─────────────────────────────────────────────────────────────

export function _setFeriadosForTest(ano: number, datas: string[]): void {
  cache.set(ano, new Set(datas));
}

export function _clearFeriadosCache(): void {
  cache.clear();
}
