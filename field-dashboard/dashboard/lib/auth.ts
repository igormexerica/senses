/**
 * Verificação de HTTP Basic Auth compartilhada entre o proxy (gate global) e
 * as server actions (defense-in-depth — a escrita não depende só do matcher).
 */
export function checkBasic(header: string | null | undefined): boolean {
  const USER = process.env.DASHBOARD_USER ?? "";
  const PASS = process.env.DASHBOARD_PASS ?? "";
  // sem credenciais configuradas: não trava (evita lockout acidental)
  if (!USER && !PASS) return true;
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  return i >= 0 && decoded.slice(0, i) === USER && decoded.slice(i + 1) === PASS;
}

/** UUID v4-ish (formato), pra validar ids vindos de formulário antes de ir pro banco. */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
