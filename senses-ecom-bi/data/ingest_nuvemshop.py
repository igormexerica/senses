#!/usr/bin/env python3
"""
Ingestão Nuvemshop /orders -> analytics.fato_diario (vendas, receita).

Conta pedidos PAGOS e não cancelados, agregados pela DATA DE CRIAÇÃO no fuso
America/Sao_Paulo (mesma convenção do painel de Estatísticas da Nuvemshop).

Uso:
    python ingest_nuvemshop.py                                # ontem (cron diário)
    python ingest_nuvemshop.py --from 2026-04-01 --to 2026-06-16   # backfill

Env necessárias:
    NUVEMSHOP_STORE_ID, NUVEMSHOP_TOKEN, DATABASE_URL
    NUVEMSHOP_APP_NAME, NUVEMSHOP_CONTACT_EMAIL  (compõem o User-Agent obrigatório)
    NUVEMSHOP_API_BASE  (opcional; default https://api.nuvemshop.com/v1)
"""
import os
import sys
import time
import argparse
import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

import requests
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TZ    = ZoneInfo("America/Sao_Paulo")
BASE  = os.environ.get("NUVEMSHOP_API_BASE", "https://api.nuvemshop.com/v1")
STORE = os.environ["NUVEMSHOP_STORE_ID"]
TOKEN = os.environ["NUVEMSHOP_TOKEN"]
APP   = os.environ.get("NUVEMSHOP_APP_NAME", "SensesBI")
EMAIL = os.environ.get("NUVEMSHOP_CONTACT_EMAIL", "contato@gruposenses.com.br")
DB    = os.environ["DATABASE_URL"]

# ATENÇÃO: a v1 exige 'Authentication: bearer' em minúsculo.
# 'Authorization: Bearer' devolve 401 invalid access token.
HEADERS = {
    "Authentication": f"bearer {TOKEN}",
    "User-Agent": f"{APP} ({EMAIL})",
    "Content-Type": "application/json",
}

PER_PAGE = 200  # máximo da API


def daterange(d0, d1):
    d = d0
    while d <= d1:
        yield d
        d += dt.timedelta(days=1)


def request_with_retry(url, params, tries=5):
    for i in range(tries):
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if r.status_code == 429:                       # rate limit (leaky bucket)
            time.sleep(int(r.headers.get("Retry-After", 2)))
            continue
        if r.status_code >= 500:                        # instabilidade -> backoff
            time.sleep(2 ** i)
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()


def fetch_orders(d_ini, d_fim):
    """Itera pedidos criados no intervalo, em janelas mensais (limite de 10k/consulta)."""
    out = []
    chunk_start = d_ini
    while chunk_start <= d_fim:
        chunk_end = min(d_fim, chunk_start + dt.timedelta(days=30))
        created_min = dt.datetime.combine(chunk_start, dt.time.min, TZ).isoformat()
        created_max = dt.datetime.combine(chunk_end,   dt.time.max, TZ).isoformat()
        page = 1
        while True:
            params = {
                "created_at_min": created_min,
                "created_at_max": created_max,
                "payment_status": "paid",
                "per_page": PER_PAGE,
                "page": page,
                "fields": "id,total,created_at,payment_status,status,cancelled_at",
            }
            batch = request_with_retry(f"{BASE}/{STORE}/orders", params).json()
            if not batch:
                break
            out.extend(batch)
            if len(batch) < PER_PAGE:
                break
            page += 1
        chunk_start = chunk_end + dt.timedelta(days=1)
    return out


def aggregate(orders):
    """data -> (qtd_vendas, receita). Reforça pago + não cancelado no cliente."""
    agg = defaultdict(lambda: [0, 0.0])
    for o in orders:
        if o.get("payment_status") != "paid":
            continue
        if o.get("status") == "cancelled" or o.get("cancelled_at"):
            continue
        d = dt.datetime.fromisoformat(o["created_at"]).astimezone(TZ).date()
        agg[d][0] += 1
        agg[d][1] += float(o.get("total") or 0)   # troque p/ 'subtotal' se quiser receita s/ frete
    return agg


def upsert(agg, d_ini, d_fim):
    now = dt.datetime.now()
    # grava TODO dia do intervalo (0 quando não há venda) -> cobertura financeira explícita
    rows = [(d, agg.get(d, [0, 0.0])[0], round(agg.get(d, [0, 0.0])[1], 2), now)
            for d in daterange(d_ini, d_fim)]
    sql = """
        insert into analytics.fato_diario (data, vendas, receita, atualizado_em)
        values %s
        on conflict (data) do update set
            vendas        = excluded.vendas,
            receita       = excluded.receita,
            atualizado_em = now();
    """
    with psycopg2.connect(DB) as conn, conn.cursor() as cur:
        execute_values(cur, sql, rows)
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="d_from")
    ap.add_argument("--to",   dest="d_to")
    a = ap.parse_args()

    if a.d_from:
        d_ini = dt.date.fromisoformat(a.d_from)
        d_fim = dt.date.fromisoformat(a.d_to) if a.d_to else d_ini
    else:
        d_fim = d_ini = dt.date.today() - dt.timedelta(days=1)

    print(f"[nuvemshop] coletando pedidos pagos {d_ini} -> {d_fim} ...")
    orders = fetch_orders(d_ini, d_fim)
    agg = aggregate(orders)
    n = upsert(agg, d_ini, d_fim)

    tot_v = sum(v for v, _ in agg.values())
    tot_r = sum(r for _, r in agg.values())
    print(f"[nuvemshop] {len(orders)} pedidos brutos | {tot_v} vendas pagas | "
          f"R$ {tot_r:,.2f} | {n} dias gravados")


if __name__ == "__main__":
    main()
