#!/usr/bin/env python3
"""
Ingestão GA4 (Data API) -> analytics.fato_diario (funil) + fato_trafego_dia + fato_checkout_dia.

Puxa por dia: sessões (visitas), eventos de funil, origem do tráfego e dispositivo.
O financeiro (vendas/receita) NÃO é tocado aqui — vem do ingest_nuvemshop.py.

Uso:
    python ingest_ga4.py                                  # ontem (cron diário)
    python ingest_ga4.py --from 2026-04-01 --to 2026-06-16    # backfill

Env necessárias:
    GA4_PROPERTY_ID
    GOOGLE_APPLICATION_CREDENTIALS  (caminho do JSON da service account)
    DATABASE_URL

Pré-requisito: dar acesso de "Leitor" à propriedade GA4 para o e-mail da service account.
"""
import os
import argparse
import datetime as dt
from collections import defaultdict

import psycopg2
from psycopg2.extras import execute_values
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest, DateRange, Dimension, Metric, Filter, FilterExpression,
)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PROPERTY = f"properties/{os.environ['GA4_PROPERTY_ID']}"
DB       = os.environ["DATABASE_URL"]

EVENTOS_FUNIL  = ["add_to_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase"]
CHECKOUT_STEPS = ["begin_checkout", "add_shipping_info", "add_payment_info", "purchase"]

# Channel groups do GA4 -> baldes em pt-BR (igual ao painel da Nuvemshop)
MAP_CANAL = {
    "Direct": "Direto",
    "Organic Search": "Busca", "Paid Search": "Busca",
    "Organic Shopping": "Busca", "Paid Shopping": "Busca",
    "Organic Social": "Social", "Paid Social": "Social",
    "Email": "Email",
    "Referral": "Referência",
}

client = BetaAnalyticsDataClient()


def run(dims, mets, d_ini, d_fim, dim_filter=None):
    req = RunReportRequest(
        property=PROPERTY,
        date_ranges=[DateRange(start_date=d_ini.isoformat(), end_date=d_fim.isoformat())],
        dimensions=[Dimension(name=d) for d in dims],
        metrics=[Metric(name=m) for m in mets],
        dimension_filter=dim_filter,
        limit=100000,
    )
    return client.run_report(req)


def ymd(s):  # '20260615' -> date
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def coletar(d_ini, d_fim):
    # 1) sessões por dia
    sess = {}
    for row in run(["date"], ["sessions"], d_ini, d_fim).rows:
        sess[ymd(row.dimension_values[0].value)] = int(row.metric_values[0].value)

    # 2) eventos do funil por dia
    ev_filter = FilterExpression(filter=Filter(
        field_name="eventName",
        in_list_filter=Filter.InListFilter(values=EVENTOS_FUNIL),
    ))
    eventos = defaultdict(lambda: defaultdict(int))   # data -> evento -> contagem
    for row in run(["date", "eventName"], ["eventCount"], d_ini, d_fim, ev_filter).rows:
        d = ymd(row.dimension_values[0].value)
        eventos[d][row.dimension_values[1].value] += int(row.metric_values[0].value)

    # 3) origem (canal) por dia
    origem = defaultdict(lambda: defaultdict(int))
    try:
        rows = run(["date", "sessionDefaultChannelGroup"], ["sessions"], d_ini, d_fim).rows
    except Exception:
        # algumas propriedades só aceitam o nome antigo
        rows = run(["date", "sessionDefaultChannelGrouping"], ["sessions"], d_ini, d_fim).rows
    for row in rows:
        d = ymd(row.dimension_values[0].value)
        canal = MAP_CANAL.get(row.dimension_values[1].value, "Outros")
        origem[d][canal] += int(row.metric_values[0].value)

    # 4) dispositivo por dia
    device = defaultdict(lambda: defaultdict(int))
    for row in run(["date", "deviceCategory"], ["sessions"], d_ini, d_fim).rows:
        d = ymd(row.dimension_values[0].value)
        device[d][row.dimension_values[1].value] += int(row.metric_values[0].value)

    return sess, eventos, origem, device


def upsert(sess, eventos, origem, device):
    dias = sorted(set(sess) | set(eventos) | set(origem) | set(device))
    now = dt.datetime.now()

    fato = [
        (d, sess.get(d), eventos[d].get("add_to_cart"), eventos[d].get("begin_checkout"), "ga4", now)
        for d in dias
    ]
    trafego = []
    for d in dias:
        for canal, v in origem[d].items():
            trafego.append((d, "origem", canal, v))
        for dev, v in device[d].items():
            trafego.append((d, "dispositivo", dev, v))
    checkout = [(d, etapa, eventos[d].get(etapa, 0)) for d in dias for etapa in CHECKOUT_STEPS]

    with psycopg2.connect(DB) as conn, conn.cursor() as cur:
        execute_values(cur, """
            insert into analytics.fato_diario
                (data, visitas, carrinhos, checkouts, fonte_funil, atualizado_em)
            values %s
            on conflict (data) do update set
                visitas       = excluded.visitas,
                carrinhos     = excluded.carrinhos,
                checkouts     = excluded.checkouts,
                fonte_funil   = 'ga4',
                atualizado_em = now();
        """, fato)

        execute_values(cur, """
            insert into analytics.fato_trafego_dia (data, dimensao, valor, visitas)
            values %s
            on conflict (data, dimensao, valor) do update set visitas = excluded.visitas;
        """, trafego)

        execute_values(cur, """
            insert into analytics.fato_checkout_dia (data, etapa, eventos)
            values %s
            on conflict (data, etapa) do update set eventos = excluded.eventos;
        """, checkout)

    return len(dias)


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

    print(f"[ga4] coletando funil/tráfego {d_ini} -> {d_fim} ...")
    sess, eventos, origem, device = coletar(d_ini, d_fim)
    n = upsert(sess, eventos, origem, device)

    tot_sess = sum(sess.values())
    tot_atc  = sum(e.get("add_to_cart", 0) for e in eventos.values())
    tot_bc   = sum(e.get("begin_checkout", 0) for e in eventos.values())
    print(f"[ga4] {n} dias | {tot_sess} visitas | {tot_atc} add_to_cart | {tot_bc} begin_checkout")
    # aviso útil: etapas do meio do checkout costumam faltar dependendo da integração
    if not any(e.get("add_payment_info") for e in eventos.values()):
        print("[ga4] aviso: nenhum 'add_payment_info' no período — confira no DebugView "
              "se a integração da Nuvemshop dispara esse evento.")


if __name__ == "__main__":
    main()
