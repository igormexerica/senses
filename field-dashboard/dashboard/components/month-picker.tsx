"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { mesLabel } from "@/lib/format";

export function MonthPicker({
  months,
  value,
  param = "mes",
  label,
}: {
  months: string[];
  value: string;
  param?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set(param, e.target.value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      {label && <span className="text-slate-500">{label}</span>}
      <select
        value={value}
        onChange={onChange}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {mesLabel(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
