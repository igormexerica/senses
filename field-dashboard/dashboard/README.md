This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Comparativo de Performance (`/comparativo`)

Comparação de **3 períodos** do e-commerce (Senses) — KPIs, funil, retenção de
checkout e tráfego, lado a lado. Visual com escala de cor por tempo
(claro → escuro = mais antigo → agora).

**Dados.** Vêm do schema `analytics` (Postgres do Supabase self-hosted), populado
pelos scripts em [`bi/`](./bi) (Nuvemshop = financeiro, GA4 = funil). O acesso é
**server-only**: `lib/bi.ts` importa `"server-only"` e usa `pg` via `DATABASE_URL`
— nenhuma credencial de banco vai pro bundle do client.

```
bi/schema.sql ─► analytics.kpis_periodo / trafego_periodo / checkout_retencao
        │
   lib/bi.ts (server-only, pg)  ──►  app/api/comparativo/route.ts (GET, JSON)
        │                                      ▲
   app/comparativo/page.tsx (fetch inicial SSR) │  refetch ao trocar preset/custom
        └──► components/comparativo-performance.tsx (client)
```

**Variáveis de ambiente** (em `.env.local`, server-only):

| Var | Para quê |
|-----|----------|
| `DATABASE_URL` | Connection string do Postgres. Ex.: `postgresql://postgres:SENHA@localhost:5432/postgres`. Só lida no server. |

**Subir do zero:**

```bash
# 1) schema + funções (idempotente; cria o schema analytics, não toca em field)
psql "$DATABASE_URL" -f bi/schema.sql
# 2) backfill (ver bi/README.md p/ tokens Nuvemshop/GA4)
python bi/ingest_nuvemshop.py --from 2026-04-01 --to 2026-06-16
python bi/ingest_ga4.py       --from 2026-04-01 --to 2026-06-16
# 3) DATABASE_URL no .env.local e reiniciar o app
```

Sem `DATABASE_URL` (ou banco inacessível) a página degrada graciosamente: mostra o
erro em vez de quebrar. Onde não houve GA4 no período, cada métrica do funil aparece
como **"sem dados"** (nunca zero) — o financeiro (Nuvemshop) continua aparecendo.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
