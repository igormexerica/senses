import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic Auth em todo o dashboard (Next 16 "proxy", ex-middleware).
 * Credenciais em .env.local (DASHBOARD_USER / DASHBOARD_PASS) — nunca no
 * bundle do cliente. Lido em runtime (self-hosted next start).
 */
export function proxy(req: NextRequest) {
  const USER = process.env.DASHBOARD_USER ?? "";
  const PASS = process.env.DASHBOARD_PASS ?? "";

  // Sem credenciais configuradas: não trava (evita lockout acidental).
  if (!USER && !PASS) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = "";
    }
    const i = decoded.indexOf(":");
    const u = i >= 0 ? decoded.slice(0, i) : "";
    const p = i >= 0 ? decoded.slice(i + 1) : "";
    if (u === USER && p === PASS) return NextResponse.next();
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Field · Senses", charset="UTF-8"',
    },
  });
}

export const config = {
  // protege tudo, menos assets estáticos do Next e o favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
