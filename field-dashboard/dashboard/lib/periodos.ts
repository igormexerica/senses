/**
 * Períodos do comparativo — math pura de datas (sem fuso, sem I/O).
 * Compartilhado server (route handler, page) e client (seletor de presets).
 *
 * Convenção: a lista de 3 períodos vai SEMPRE do mais antigo (P1) ao mais
 * recente (P3) — é o que sustenta a escala de cor "claro→escuro = antigo→agora".
 */
import { diaCurto } from "./format";

export type Periodo = { ini: string; fim: string };

export type Preset = "mtd" | "30d" | "14d" | "7d" | "custom";

/** Presets selecionáveis. Todos geram 3 janelas do MESMO tamanho. */
export const PRESETS: { key: Exclude<Preset, "custom">; label: string; hint: string }[] = [
  { key: "mtd", label: "Mês a mês", hint: "do dia 1 até hoje, nos 3 últimos meses" },
  { key: "30d", label: "30 dias", hint: "3 janelas seguidas de 30 dias" },
  { key: "14d", label: "14 dias", hint: "3 janelas seguidas de 14 dias" },
  { key: "7d", label: "7 dias", hint: "3 janelas seguidas de 7 dias" },
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARAM_KEYS = ["p1ini", "p1fim", "p2ini", "p2fim", "p3ini", "p3fim"] as const;

// --- helpers de data (UTC puro; mesma régua de lib/format.ts) ----------------
function ymdToUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const dt = ymdToUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}
/** Dia 1 do mês de `iso`, deslocado `n` meses. */
function primeiroDoMes(iso: string, n = 0): string {
  const [y, m] = iso.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m - 1 + n, 1)));
}
/** Último dia do mês de `iso` (lida com fev/30/31). */
function ultimoDoMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}

/** Uma data existe de fato (rejeita 2026-02-31, 2026-13-01, etc.). */
export function ehDataReal(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Valida um período. Lança Error descritivo (vira 400 no route handler). */
export function validarPeriodo(p: Periodo, rotulo = "período"): void {
  if (!p || !ehDataReal(p.ini) || !ehDataReal(p.fim))
    throw new Error(`${rotulo}: data inválida (esperado YYYY-MM-DD).`);
  if (p.fim < p.ini) throw new Error(`${rotulo}: fim (${p.fim}) é anterior ao início (${p.ini}).`);
}

/** 3 janelas de tamanho igual para um preset, ancoradas em `hoje` (YYYY-MM-DD). */
export function periodosDoPreset(preset: Exclude<Preset, "custom">, hoje: string): Periodo[] {
  if (preset === "mtd") {
    // Mesma janela "dia 1 → dia N" em 3 meses. Quando o mês é mais curto que N
    // (ex.: fev × dia 31), corta no último dia do mês — janelas nunca se sobrepõem
    // nem invadem o mês seguinte (o que faria dupla contagem). Por isso o tamanho
    // pode variar 1–3 dias entre os meses; os presets de N dias garantem igualdade.
    const n = Number(hoje.slice(8, 10)); // dia do mês corrente
    return [-2, -1, 0].map((off) => {
      const ini = primeiroDoMes(hoje, off);
      const alvo = addDays(ini, n - 1);
      const fim = alvo < ultimoDoMes(ini) ? alvo : ultimoDoMes(ini);
      return { ini, fim };
    });
  }
  const tam = preset === "30d" ? 30 : preset === "14d" ? 14 : 7;
  const ini3 = addDays(hoje, -(tam - 1));
  const fim2 = addDays(ini3, -1);
  const ini2 = addDays(fim2, -(tam - 1));
  const fim1 = addDays(ini2, -1);
  const ini1 = addDays(fim1, -(tam - 1));
  return [
    { ini: ini1, fim: fim1 },
    { ini: ini2, fim: fim2 },
    { ini: ini3, fim: hoje },
  ];
}

function presetValido(v: string | undefined): Preset {
  return v === "mtd" || v === "30d" || v === "14d" || v === "7d" || v === "custom" ? v : "mtd";
}

/**
 * Resolve a seleção a partir de params (URL/query).
 * - Com os 6 p{1..3}{ini,fim} presentes → custom (valida e pode lançar).
 * - Sem eles → aplica o preset (default "mtd"), nunca lança.
 */
export function parsePeriodos(
  params: Record<string, string | undefined>,
  hoje: string,
): { periodos: Periodo[]; preset: Preset } {
  const temTodos = PARAM_KEYS.every((k) => !!params[k]);
  if (temTodos) {
    const periodos: Periodo[] = [
      { ini: params.p1ini!, fim: params.p1fim! },
      { ini: params.p2ini!, fim: params.p2fim! },
      { ini: params.p3ini!, fim: params.p3fim! },
    ];
    periodos.forEach((p, i) => validarPeriodo(p, `P${i + 1}`));
    return { periodos, preset: "custom" };
  }
  const preset = presetValido(params.preset);
  const efetivo = preset === "custom" ? "mtd" : preset;
  return { periodos: periodosDoPreset(efetivo, hoje), preset: efetivo };
}

/** Serializa 3 períodos + preset em query string (URL compartilhável / fetch). */
export function periodosParaQuery(periodos: Periodo[], preset: Preset): string {
  const q = new URLSearchParams({ preset });
  periodos.forEach((p, i) => {
    q.set(`p${i + 1}ini`, p.ini);
    q.set(`p${i + 1}fim`, p.fim);
  });
  return q.toString();
}

/** "01/04 – 16/04" */
export function rotuloPeriodo(p: Periodo): string {
  return `${diaCurto(p.ini)} – ${diaCurto(p.fim)}`;
}
