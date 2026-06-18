/**
 * HTTP Basic Auth multi-usuário (login POR PESSOA) — server-only.
 * DASHBOARD_USERS="email:senha,email:senha,..." (sem senha única compartilhada).
 * Senhas geradas alfanuméricas (não podem conter ':' nem ',').
 * Usado pelo proxy (gate global) e pelo layout (mostrar quem está logado).
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

/** Usuário logado (login do Basic Auth) — só o login, nunca a senha. */
export function usuarioBasic(header: string | null | undefined): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(":");
    return i > 0 ? decoded.slice(0, i) : null;
  } catch {
    return null;
  }
}
