/**
 * Verificação de HTTP Basic Auth compartilhada entre o proxy (gate global) e
 * as server actions (defense-in-depth — a escrita não depende só do matcher).
 *
 * Multi-usuário: DASHBOARD_USER/DASHBOARD_PASS (1º usuário) + DASHBOARD_USERS
 * ("email:senha,email:senha"). Senhas não podem conter ':' nem ',' (geramos
 * alfanuméricas).
 */
function credenciais(): Array<[string, string]> {
  const pares: Array<[string, string]> = [];
  const u = (process.env.DASHBOARD_USER ?? "").trim();
  const p = process.env.DASHBOARD_PASS ?? "";
  if (u && p) pares.push([u, p]);
  for (const item of (process.env.DASHBOARD_USERS ?? "").split(",")) {
    const i = item.indexOf(":");
    if (i > 0) pares.push([item.slice(0, i).trim(), item.slice(i + 1).trim()]);
  }
  return pares;
}

export function checkBasic(header: string | null | undefined): boolean {
  const pares = credenciais();
  // sem credenciais configuradas: não trava (evita lockout acidental)
  if (pares.length === 0) return true;
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const u = decoded.slice(0, i);
  const p = decoded.slice(i + 1);
  return pares.some(([eu, ep]) => eu === u && ep === p);
}

/** UUID v4-ish (formato), pra validar ids vindos de formulário antes de ir pro banco. */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
