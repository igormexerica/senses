const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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
