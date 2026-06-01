import { mesLabel } from "@/lib/format";

export interface TrendPoint {
  mes: string;
  visita: number | null;
  refil: number | null;
}

/**
 * Gráfico de linha (SVG puro) da evolução de % por mês: visita + refil.
 * Eixo Y com piso dinâmico (rotulado) pra amplificar a variação sem mentir.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const W = 720;
  const H = 280;
  const left = 38;
  const right = 14;
  const top = 16;
  const bottom = 30;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const vals = data.flatMap((d) =>
    [d.visita, d.refil].filter((v): v is number => v !== null),
  );
  const minV = vals.length ? Math.min(...vals) : 0;
  const domainMin = Math.max(0, Math.floor((minV - 5) / 5) * 5);
  const domainMax = 100;

  const n = data.length;
  const x = (i: number) => (n <= 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
  const y = (v: number) =>
    top + (1 - (v - domainMin) / (domainMax - domainMin)) * plotH;

  const yTicks = [domainMin, Math.round((domainMin + domainMax) / 2), domainMax];

  const line = (key: "visita" | "refil") =>
    data
      .map((d, i) => ({ i, v: d[key] }))
      .filter((p) => p.v !== null)
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v as number).toFixed(1)}`)
      .join(" ");

  // mostra ~todos os rótulos do x se couber; senão alterna
  const labelEvery = n > 16 ? 2 : 1;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução de cobertura por mês">
        {/* gridlines + y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {t}%
            </text>
          </g>
        ))}
        {/* x labels — mostra o ano em janeiro e no 1º tick (evita ambiguidade entre anos) */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0) return null;
          const [mm, yyyy] = mesLabel(d.mes).split("/");
          const showYear = i === 0 || mm === "jan";
          return (
            <text key={d.mes} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {showYear ? `${mm}/${yyyy.slice(2)}` : mm}
            </text>
          );
        })}
        {/* refil (emerald) */}
        <path d={line("refil")} fill="none" stroke="#10b981" strokeWidth={2} />
        {data.map((d, i) =>
          d.refil !== null ? (
            <circle key={`r${d.mes}`} cx={x(i)} cy={y(d.refil)} r={2.5} fill="#10b981" />
          ) : null,
        )}
        {/* visita (brand) */}
        <path d={line("visita")} fill="none" stroke="#4f46e5" strokeWidth={2} />
        {data.map((d, i) =>
          d.visita !== null ? (
            <circle key={`v${d.mes}`} cx={x(i)} cy={y(d.visita)} r={2.5} fill="#4f46e5" />
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-brand-600" /> Visita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Refil
        </span>
      </div>
    </div>
  );
}
