"""
sync_avaliacoes.py — Avaliações (Field -> Supabase). Paralelizado + incremental.

Fonte: GET /ratings (stars, comment, createdAt, task{id}). O task.id é id de
TASK, não de order — resolve-se via GET /tasks/{id}.order.id e daí pra
ordens_servico.codigo_field. Ver D3 + camada de tasks em DESCOBERTAS-API.md.

Incremental: /ratings não tem filtro por data, mas a avaliação é imutável -> a
gente lista tudo (barato) e pula as com createdAt <= since ANTES do /tasks/{id}
(que é o custo). avaliacoes.os_id é UNIQUE -> upsert on_conflict=os_id.
"""
from __future__ import annotations

import os
import logging
from concurrent.futures import ThreadPoolExecutor

from field_client import FieldClient
from supabase_client import SupabaseClient

logger = logging.getLogger("sync_avaliacoes")


def _processar_rating(field: FieldClient, supa: SupabaseClient, av: dict, since: str | None):
    """Devolve (data_avaliacao, resultado) em {'ok','sem_os','skip','antiga'}."""
    data_av = av.get("createdAt")
    if since and data_av and data_av <= since:
        return data_av, "antiga"  # já sincronizada (incremental) — evita o /tasks/{id}

    task_id = str((av.get("task") or {}).get("id") or "")
    if not task_id:
        return None, "skip"
    try:
        order_codigo = str((field.recuperar_task(task_id).get("order") or {}).get("id") or "")
    except Exception as e:  # noqa: BLE001
        logger.warning("task %s falhou: %s", task_id, e)
        return None, "skip"
    if not order_codigo:
        return None, "skip"

    os_rows = supa.select("ordens_servico",
                          {"codigo_field": f"eq.{order_codigo}", "select": "id", "limit": "1"})
    if not os_rows:
        return data_av, "sem_os"

    stars = av.get("stars")
    supa.insert("avaliacoes", [{
        "codigo_field": f"{order_codigo}|{data_av}",
        "os_id": os_rows[0]["id"],
        "nota": int(stars) if stars is not None else None,
        "comentario": av.get("comment") or "",
        "data_avaliacao": data_av,
    }], upsert=True, on_conflict="os_id")
    return data_av, "ok"


def sync(field: FieldClient, supa: SupabaseClient, since: str | None = None,
         workers: int | None = None) -> int:
    workers = workers or int(os.environ.get("SYNC_WORKERS", "6"))
    erro = None
    maior_updated = since
    ok = sem_os = skip = antigas = 0

    try:
        ratings = list(field.listar_avaliacoes())
        logger.info("Avaliações: %d no Field (since=%s, workers=%d)", len(ratings), since, workers)
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for data_av, res in ex.map(lambda av: _processar_rating(field, supa, av, since), ratings):
                if res == "ok":
                    ok += 1
                    if data_av and (maior_updated is None or data_av > maior_updated):
                        maior_updated = data_av
                elif res == "sem_os":
                    sem_os += 1
                elif res == "antiga":
                    antigas += 1
                else:
                    skip += 1
        logger.info("Avaliações: %d novas | %d sem OS local | %d sem task | %d já sincronizadas",
                    ok, sem_os, skip, antigas)
    except Exception as e:  # noqa: BLE001
        erro = str(e)
        logger.exception("Erro no sync de avaliações")
        raise
    finally:
        supa.registrar_sync("avaliacoes", maior_updated, ok, erro)
    return ok


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    with FieldClient() as f, SupabaseClient() as s:
        st = s.get_sync_state("avaliacoes")
        sync(f, s, since=st["ultimo_updated_at"] if st else None)
