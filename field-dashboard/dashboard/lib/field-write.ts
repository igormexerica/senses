/**
 * Escrita no schema `field` via PostgREST com SERVICE_ROLE.
 * Server-only: usado SÓ por server actions (atrás do login). A service_role
 * nunca vai pro bundle do cliente.
 */
import "server-only";
import type { StatusAcao } from "./field";

const BASE = process.env.SUPABASE_URL ?? "http://localhost:8000";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "Content-Profile": "field",
    "Accept-Profile": "field",
    ...extra,
  };
}

export async function upsertAcao(p: {
  expectativa_id: string;
  status: StatusAcao;
  responsavel: string | null;
  nota: string | null;
}): Promise<void> {
  if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente — escrita desabilitada.");
  const res = await fetch(`${BASE}/rest/v1/planos_acao?on_conflict=expectativa_id`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({
      expectativa_id: p.expectativa_id,
      status: p.status,
      responsavel: p.responsavel,
      nota: p.nota,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upsertAcao ${res.status}: ${await res.text()}`);
}

export async function removerAcao(expectativaId: string): Promise<void> {
  if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente — escrita desabilitada.");
  const res = await fetch(
    `${BASE}/rest/v1/planos_acao?expectativa_id=eq.${expectativaId}`,
    { method: "DELETE", headers: headers(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`removerAcao ${res.status}: ${await res.text()}`);
}
