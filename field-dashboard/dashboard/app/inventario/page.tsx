import { getInventarioModelo, getInventarioCliente } from "@/lib/field";
import { num } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardTitle,
  Stat,
  Bar,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import { InventarioClienteTable } from "@/components/inventario-cliente-table";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  let modelos: Awaited<ReturnType<typeof getInventarioModelo>>;
  let clientes: Awaited<ReturnType<typeof getInventarioCliente>>;
  try {
    [modelos, clientes] = await Promise.all([
      getInventarioModelo(),
      getInventarioCliente(2000),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Inventário" />
        <ErrorState error={error} />
      </>
    );
  }

  const frota = modelos.reduce((s, m) => s + m.total, 0);
  const identificados = modelos
    .filter((m) => m.modelo !== "NÃO IDENTIFICADO")
    .reduce((s, m) => s + m.total, 0);
  const distintos = modelos.filter((m) => m.modelo !== "NÃO IDENTIFICADO").length;
  const maxTotal = modelos.reduce((m, x) => Math.max(m, x.total), 0);

  return (
    <>
      <PageHeader
        title="Inventário"
        subtitle="Máquinas instaladas (clientes ativos, equipamento em uso)"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Frota ativa" value={num(frota)} sub="máquinas em uso" />
        <Stat label="Clientes c/ máquina" value={num(clientes.length)} />
        <Stat label="Modelos distintos" value={num(distintos)} />
        <Stat
          label="Identificados"
          value={num(identificados)}
          sub={`${num(frota - identificados)} sem modelo no Field`}
          tone={frota - identificados > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle hint={`${num(frota)} máquinas`}>Frota por modelo</CardTitle>
          {modelos.length === 0 ? (
            <EmptyState>Sem equipamentos sincronizados.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {modelos.map((m) => {
                const naoIdent = m.modelo === "NÃO IDENTIFICADO";
                return (
                  <li key={m.modelo} className="px-4 py-3 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={`truncate text-sm font-medium ${
                          naoIdent ? "italic text-slate-400" : "text-slate-800"
                        }`}
                      >
                        {naoIdent ? "Não-Senses (própria)" : m.modelo}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        {num(m.total)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar
                        value={m.total}
                        max={maxTotal}
                        className={naoIdent ? "bg-slate-300" : "bg-brand-500"}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                      {m.branca > 0 && <span>◻ {num(m.branca)} branca</span>}
                      {m.preta > 0 && <span>◼ {num(m.preta)} preta</span>}
                      <span>· {num(m.clientes)} cliente(s)</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle hint={`${num(clientes.length)} clientes`}>
            Inventário por cliente
          </CardTitle>
          <InventarioClienteTable rows={clientes} />
        </Card>
      </div>
    </>
  );
}
