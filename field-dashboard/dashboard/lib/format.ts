const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Primeiro dia do mês corrente no fuso do negócio (America/Sao_Paulo) -> "YYYY-MM-01".
 *  Evita virada de mês errada no fim do dia (o host roda em UTC). */
export function mesAtualISO(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${ymd.slice(0, 7)}-01`;
}

/** Hoje no fuso do negócio (YYYY-MM-DD). */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Dia do mês corrente (1–31) no fuso do negócio. */
export function diaDoMes(): number {
  return Number(hojeISO().slice(8, 10));
}

/** Corte: depois deste dia, gap do mês corrente sem agendamento vira "atrasado". */
export const CORTE_AGENDAMENTO = 20;

/** Estado de cobertura de um gap (sem usar "crítico"). */
export function estadoGap(
  agendadoField: boolean | undefined,
  mesRef: string,
  mesAtual: string,
  dia: number,
): "agendado" | "atrasado" | "sem_agendamento" {
  if (agendadoField) return "agendado";
  if (mesRef < mesAtual) return "atrasado"; // mês fechado e não rolou
  if (mesRef === mesAtual && dia > CORTE_AGENDAMENTO) return "atrasado";
  return "sem_agendamento";
}

/** "YYYY-MM-DD" - n dias. */
export function diasAtras(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

/** segunda-feira da semana de uma data (YYYY-MM-DD). */
export function inicioSemanaISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/** "2026-06-01" -> "01/06" */
export function diaCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** valida/normaliza um mês vindo da URL contra a lista disponível.
 *  Retorna o mês se válido; senão o preferido (default) ou o 1º disponível. */
export function resolverMes(
  candidato: string | undefined,
  disponiveis: string[],
  preferido?: string,
): string {
  if (candidato && disponiveis.includes(candidato)) return candidato;
  if (preferido && disponiveis.includes(preferido)) return preferido;
  return disponiveis[0] ?? (preferido ?? mesAtualISO());
}

/** "2026-05-01" -> "mai/2026" */
export function mesLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const i = Number(m) - 1;
  return `${MESES[i] ?? m}/${y}`;
}

/** ISO timestamp -> "30/05 14:20" (pt-BR, sem ano se for ano corrente) */
export function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO -> "30/05/2026" */
export function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("pt-BR");
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** "2026-05-01" -> "2026-04-01" (mês anterior, sempre dia 1) */
export function mesAnteriorISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** diferença em pontos percentuais (atual - anterior), arredondada a 1 casa */
export function deltaPp(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): number | null {
  if (atual === null || atual === undefined || anterior === null || anterior === undefined)
    return null;
  return Math.round((atual - anterior) * 10) / 10;
}

/** "+4,2 pp" / "-1,3 pp" / "0 pp" */
export function ppLabel(d: number | null): string {
  if (d === null) return "—";
  const s = d > 0 ? "+" : "";
  return `${s}${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp`;
}

/** "há 2h", "há 3d" — quanto tempo desde uma data passada */
export function desde(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
