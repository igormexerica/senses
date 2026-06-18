# Deploy — `senses-ecom-bi` (Contabo: Docker + cloudflared + Access)

App **autônomo** em **container Docker**, na rede `supabase_default`.

> **Por que container (e não systemd no host):** o Postgres do Supabase
> (`supabase-db`) só é alcançável **dentro da rede docker** — não publica porta no
> host (`localhost:5432` não responde; `localhost:5433` é outro projeto). Um processo
> no host nunca conectaria via `DATABASE_URL=localhost`. No container, na rede
> `supabase_default`, `supabase-db:5432` funciona e o cloudflared (mesma rede)
> resolve `senses-ecom-bi:3100` por DNS — **sem porta no host, sem ufw**.

## Estado atual (já feito)
- ✅ Imagem buildada, container `senses-ecom-bi` **no ar** (`docker compose up -d`), na `supabase_default`.
- ✅ Verificado: alcança `supabase-db:5432`; serve `200` em `senses-ecom-bi:3100` (via sidecar).
- ✅ Ingress no cloudflared: `bi.ifops.com.br → http://senses-ecom-bi:3100` (`/root/senses/cloudflared/config.yml`), túnel recarregado, demais hostnames intactos.
- ⏳ Sobe mostrando **"sem dados"** até `DATABASE_URL` + schema + ingest.

## Build / atualizar (eu faço)
```bash
cd /root/senses/senses-ecom-bi
docker compose build web && docker compose up -d   # rebuild + recria
docker logs --tail 20 senses-ecom-bi
```

## 1. DNS — CNAME (VOCÊ, painel Cloudflare)
Zona `ifops.com.br` → criar **CNAME `bi`** apontando para o MESMO alvo
`<tunnel-id>.cfargotunnel.com` que `field.ifops.com.br` usa (proxied/laranja).
Tunnel id: `41c382f6-0955-444d-ab1e-e5aca1a49569` → alvo
`41c382f6-0955-444d-ab1e-e5aca1a49569.cfargotunnel.com`.
⚠️ Apontar pro túnel errado = erro 1033 sem logs.

## 2. Cloudflare Access (VOCÊ, painel) — barra por e-mail
Zero Trust → **Access → Applications → Add → Self-hosted**:
- Domain: `bi.ifops.com.br`
- **Policy → Allow**: e-mails da diretoria **ou** `Emails ending in @gruposenses.com.br`
- Login: One-time PIN (e-mail) ou Google.

O app já lê `Cf-Access-Authenticated-User-Email` pra mostrar quem está logado.

## 3. Segredos → dados (PRECISA de você)
Editar `/root/senses/senses-ecom-bi/.env` (fora do git):
```env
DATABASE_URL=postgresql://postgres:<SENHA_POSTGRES>@supabase-db:5432/postgres
NUVEMSHOP_STORE_ID=...
NUVEMSHOP_TOKEN=...
GA4_PROPERTY_ID=...
GOOGLE_APPLICATION_CREDENTIALS=/app/ga4-service-account.json   # colocar o json em data/
```
Depois: `docker compose up -d` (recria o web com o DATABASE_URL).

## 4. Schema (idempotente — roda DENTRO do banco)
```bash
docker exec -i supabase-db psql -U postgres -d postgres < /root/senses/senses-ecom-bi/data/schema.sql
```

## 5. Ingestão (container na rede supabase_default)
```bash
cd /root/senses/senses-ecom-bi
# backfill histórico
docker compose run --rm ingest ingest_nuvemshop.py --from 2026-04-01 --to 2026-06-16
docker compose run --rm ingest ingest_ga4.py       --from 2026-04-01 --to 2026-06-16

# timers diários (~6h) — cada run reprocessa os ÚLTIMOS 3 DIAS (janela móvel
# idempotente: um dia que falhou é recuperado no run seguinte).
cp /root/senses/senses-ecom-bi/deploy/senses-ingest-*.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now senses-ingest-nuvemshop.timer senses-ingest-ga4.timer
systemctl list-timers 'senses-ingest-*' --no-pager
```

---

## Resumo — o que falta de você
1. **CNAME** `bi.ifops.com.br` (passo 1) + **Access policy** (passo 2) — painel Cloudflare.
2. **Segredos** (passo 3): senha do Postgres, token+store Nuvemshop, property_id+JSON GA4.
Com isso eu rodo schema + ingest e a tela passa a mostrar dados reais.
