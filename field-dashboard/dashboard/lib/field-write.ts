/**
 * Acesso PRIVILEGIADO ao schema `field` via PostgREST com SERVICE_ROLE.
 * Server-only. Usado por server actions (escrita) e pelas leituras de dados
 * internos do CS (planos_acao) que NÃO são expostos ao anon público.
 * A service_role nunca vai pro bundle do cliente.
 */
import "server-only";
import type { StatusAcao, PlanoAcao, PlanoAcaoView } from "./field";

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

async function readSR<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente.");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/rest/v1/${path}${qs ? `?${qs}` : ""}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`readSR ${res.status} em ${path}: ${await res.text()}`);
  return (await res.json()) as T[];
}

// Leituras de dados internos do CS (anon não tem mais SELECT nessas tabelas).
export const getPlanosAcao = () => readSR<PlanoAcao>("planos_acao");
export const getVPlanosAcao = () =>
  readSR<PlanoAcaoView>("v_planos_acao", { order: "updated_at.desc" });

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
  const filtro = new URLSearchParams({ expectativa_id: `eq.${expectativaId}` });
  const res = await fetch(`${BASE}/rest/v1/planos_acao?${filtro}`, {
    method: "DELETE",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`removerAcao ${res.status}: ${await res.text()}`);
}
