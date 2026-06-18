#!/usr/bin/env bash
# Finaliza os dados do senses-ecom-bi, ponta a ponta:
#   1) acha a senha do Postgres (vários lugares)  2) grava DATABASE_URL
#   3) aplica schema.sql  4) ingest Nuvemshop (financeiro)  5) recria o web
# Tudo pelo container do app (não mexe no supabase-db além de ler a senha).
# Rode:  bash /root/senses/senses-ecom-bi/deploy/finish-data.sh
set -uo pipefail
cd /root/senses/senses-ecom-bi || exit 1

echo "== 1) senha do Postgres =="
PW=""; SRC=""
for v in POSTGRES_PASSWORD PGPASSWORD SUPABASE_DB_PASSWORD POSTGRESQL_PASSWORD; do
  val=$(docker exec supabase-db printenv "$v" 2>/dev/null || true)
  if [ -n "$val" ]; then PW="$val"; SRC="env $v do container supabase-db"; break; fi
done
if [ -z "$PW" ]; then
  while IFS= read -r f; do
    val=$(grep -E '^POSTGRES_PASSWORD=' "$f" 2>/dev/null | head -1 | sed -E 's/^POSTGRES_PASSWORD=//; s/^["'\'']//; s/["'\'']$//')
    if [ -n "$val" ]; then PW="$val"; SRC="arquivo $f"; break; fi
  done < <(find /root -maxdepth 6 -path '*supabase*' -name '.env' 2>/dev/null)
fi
if [ -z "$PW" ]; then
  echo "  ✗ não achei a senha automaticamente."
  echo "    rode:  docker exec supabase-db printenv | grep -i pass"
  echo "    e me diga o NOME da variável (não o valor)."
  exit 1
fi
echo "  ✓ senha obtida de: $SRC"

echo "== 2) DATABASE_URL no .env =="
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PW")
grep -v '^DATABASE_URL=' .env > .env.t 2>/dev/null
echo "DATABASE_URL=postgresql://postgres:$ENC@supabase-db:5432/postgres" >> .env.t
mv .env.t .env; chmod 600 .env
echo "  ✓ gravado (senha não impressa)"

echo "== 3) aplica schema.sql (idempotente) =="
docker compose run --rm ingest -c "import os,psycopg2; c=psycopg2.connect(os.environ['DATABASE_URL']); c.autocommit=True; c.cursor().execute(open('schema.sql').read()); print('  ✓ schema analytics aplicado')" \
  || { echo "  ✗ falha ao conectar/aplicar schema — senha errada ou usuário diferente de 'postgres'?"; exit 1; }

echo "== 4) ingest Nuvemshop (financeiro, backfill abr→ontem) =="
docker compose run --rm ingest ingest_nuvemshop.py --from 2026-04-01 --to "$(date -d '-1 day' +%F)" \
  || { echo "  ✗ falha no ingest Nuvemshop"; exit 1; }

echo "== 5) recria o web (pega o DATABASE_URL novo) =="
docker compose up -d --force-recreate web >/dev/null 2>&1
echo ""
echo "✓ PRONTO — abra https://bi.ifops.com.br"
echo "  financeiro (vendas/receita/ticket) deve aparecer; funil/tráfego ficam 'sem dados' até o GA4."
