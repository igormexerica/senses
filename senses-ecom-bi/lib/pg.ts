/**
 * Pool Postgres compartilhado — SERVER ONLY. Connection string em DATABASE_URL,
 * nunca no client (este módulo importa "server-only").
 */
import "server-only";
import { Pool } from "pg";

let _pool: Pool | null = null;

export function pool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada (server-only). Defina a connection string do " +
        "Postgres do Supabase. Veja data/README.md.",
    );
  }
  _pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
  return _pool;
}

/** pg devolve numeric/bigint como string — normaliza p/ number|null. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
