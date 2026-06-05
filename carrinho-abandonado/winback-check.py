#!/usr/bin/env python3
"""Checagem pós-1ª-rodada do winback (sensesWinback01) + e-mail de relatório via Resend.
Disparado por timer systemd one-shot em 2026-06-06 09:00 BRT.
Lê Postgres do n8n (container n8n-postgres-1) e execuções do workflow."""
import subprocess, json, datetime, os, re

PG = ["docker", "exec", "n8n-postgres-1", "psql", "-U", "n8n", "-d", "n8n", "-t", "-A", "-F", "|", "-c"]
TO = "igor.oliveira@gruposenses.com.br"
FROM = "Casa Senses (sistema) <igor.oliveira@gruposenses.com.br>"


def q(sql):
    r = subprocess.run(PG + [sql], capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip()


def main():
    lines = []
    # 1) Pool
    pool, e1 = q("SELECT count(*), count(*) FILTER (WHERE converted), "
                 "count(*) FILTER (WHERE step=0), count(*) FILTER (WHERE step=1), "
                 "count(*) FILTER (WHERE step=2), count(*) FILTER (WHERE step=3) "
                 "FROM public.senses_winback;")
    if pool and "|" in pool:
        t, conv, s0, s1, s2, s3 = pool.split("|")
        lines.append(f"POOL senses_winback: {t} clientes (convertidos {conv})")
        lines.append(f"  por step -> 0:{s0}  1:{s1}  2:{s2}  3:{s3}")
    else:
        lines.append(f"POOL: erro ao ler ({e1 or 'tabela vazia/sem retorno'})")

    # 2) Execucoes do workflow (ultimas 24h)
    ex, e2 = q("SELECT status, count(*) FROM execution_entity "
               "WHERE \"workflowId\"='sensesWinback01' "
               "AND \"startedAt\" > now() - interval '24 hours' GROUP BY status ORDER BY status;")
    lines.append("")
    if ex:
        lines.append("EXECUCOES sensesWinback01 (24h):")
        for row in ex.splitlines():
            st, n = row.split("|")
            lines.append(f"  {st}: {n}")
    else:
        lines.append("EXECUCOES sensesWinback01 (24h): NENHUMA (cron pode nao ter rodado ainda)")

    last, _ = q("SELECT to_char(max(\"startedAt\") AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') "
                "FROM execution_entity WHERE \"workflowId\"='sensesWinback01';")
    lines.append(f"  ultima execucao (BRT): {last or 'n/a'}")

    # 3) Erros recentes (detalhe)
    errs, _ = q("SELECT to_char(\"startedAt\" AT TIME ZONE 'America/Sao_Paulo','MM-DD HH24:MI'), status "
                "FROM execution_entity WHERE \"workflowId\"='sensesWinback01' AND status NOT IN ('success') "
                "AND \"startedAt\" > now() - interval '24 hours' ORDER BY \"startedAt\" DESC LIMIT 10;")
    lines.append("")
    if errs:
        lines.append("⚠️ EXECUCOES NAO-SUCESSO (24h):")
        for row in errs.splitlines():
            lines.append("  " + row.replace("|", "  "))
    else:
        lines.append("OK: nenhuma execucao com erro nas ultimas 24h.")

    lines.append("")
    lines.append("Lembrete: bounces 'soft' (aceitos pelo Resend e rejeitados depois) NAO aparecem aqui — confira o painel Resend se precisar.")
    lines.append("Workflow ativo? confira em https://n8n.ifops.com.br (sensesWinback01).")

    body = "\n".join(lines)
    print(body)

    if os.environ.get("WINBACK_CHECK_DRYRUN") == "1":
        print("\n[DRYRUN] email NAO enviado")
        return

    # Envia via Resend
    key = ""
    try:
        for ln in open("/root/n8n/.env"):
            if ln.startswith("RESEND_API_KEY="):
                key = ln.split("=", 1)[1].strip()
    except Exception as ex:
        print("erro lendo .env:", ex)
    if not key:
        print("SEM RESEND_API_KEY — email nao enviado")
        return
    html = "<pre style='font-family:Menlo,monospace;font-size:13px;line-height:1.5'>" + \
           body.replace("&", "&amp;").replace("<", "&lt;") + "</pre>"
    payload = json.dumps({"from": FROM, "to": [TO],
                          "subject": "[Winback] Relatório 1ª rodada — " +
                          datetime.datetime.now().strftime("%d/%m %H:%M"),
                          "html": html})
    r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-X", "POST",
                        "https://api.resend.com/emails", "-A", "Mozilla/5.0",
                        "-H", "Authorization: Bearer " + key,
                        "-H", "Content-Type: application/json", "--data-binary", "@-"],
                       input=payload, capture_output=True, text=True)
    print("RESEND:", r.stdout.strip().split("\n")[-1])


if __name__ == "__main__":
    main()
