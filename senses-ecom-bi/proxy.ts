import { NextRequest, NextResponse } from "next/server";
import { checkBasic } from "@/lib/auth";

/**
 * HTTP Basic Auth em todo o app (Next 16 "proxy", ex-middleware).
 * Credenciais em .env (DASHBOARD_USERS) — nunca no bundle do cliente.
 */
export function proxy(req: NextRequest) {
  if (checkBasic(req.headers.get("authorization"))) return NextResponse.next();

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Senses · BI", charset="UTF-8"',
    },
  });
}

export const config = {
  // protege tudo, menos assets estáticos do Next e o favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
