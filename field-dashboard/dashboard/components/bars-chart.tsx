export interface BarDatum {
  label: string;
  value: number;
  title?: string;
}

/** Gráfico de colunas (SVG puro), responsivo. Y auto-escalado. */
export function BarsChart({ data }: { data: BarDatum[] }) {
  const W = 720;
  const H = 220;
  const left = 30;
  const right = 8;
  const top = 12;
  const bottom = 26;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.max(1, slot * 0.68);
  const y = (v: number) => top + (1 - v / max) * plotH;
  const yTicks = [0, Math.round(max / 2), max];
  const labelEvery = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Atividade por período">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={left - 5} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const xc = left + i * slot + (slot - barW) / 2;
          const h = plotH - (y(d.value) - top);
          return (
            <g key={i}>
              <rect x={xc} y={y(d.value)} width={barW} height={Math.max(0, h)} rx={1.5} fill="#4f46e5">
                <title>{d.title ?? `${d.label}: ${d.value}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={xc + barW / 2} y={H - 9} textAnchor="middle" fontSize={9} fill="#94a3b8">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
