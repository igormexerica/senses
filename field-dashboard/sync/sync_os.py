"""
sync_os.py — Ordens de Serviço + etiquetas + rastreio (refil) + comentários.
Paralelizado por pool de workers (corta o full backfill de ~16h pra ~horas).

REGRAS (ver DESCOBERTAS-API.md):

- tipo: serviço com "RECARGA" -> 'refil' (match_expectativas_os casa por LIKE '%refil%');
  demais mantêm o nome do serviço.

- status (DERIVADO DA TASK — a order não tem status; a /orders/{id}/tasks sim):
    archived                          -> 'inativa'
    refil + rastreio preenchido       -> 'concluida'   (conclusão segura do refil)
    refil + task done, SEM rastreio   -> 'em_execucao' (enviado, mas sem código → risco)
    refil + task não-done             -> 'pendente'
    não-refil + task done             -> 'concluida'
    não-refil + task não-done         -> 'pendente'
  concluida_em = max(task.completedAt) das tasks 'done'.
  A distinção refil com/sem rastreio (coração do controle) é preservada: o
  match_expectativas_os continua olhando respostas_form pra rastreio.

- forms: como o status agora vem da task, formulário só é buscado pra OS de REFIL
  (pegar o 'Código de rastreio.'). FORMS_SOMENTE_REFIL=False volta a varrer todos os
  forms de toda OS (mais lento; respostas_form completa). Decisão de velocidade,
  reversível.

- incremental: API não filtra por data -> lista tudo, processa só updatedAt > since.
"""
from __future__ import annotations

import os
import logging
import unicodedata
from concurrent.futures import ThreadPoolExecutor

from field_client import FieldClient
from supabase_client import SupabaseClient
from sync_clientes import normalizar_etiqueta

logger = logging.getLogger("sync_os")

FORMS_SOMENTE_REFIL = True  # busca forms só pra refil (rastreio); ver docstring


def _sa(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _maxts(atual: str | None, ts: str | None) -> str | None:
    return ts if ts and (atual is None or ts > atual) else atual


def _tipo_os(nome_servico: str) -> str:
    if "recarga" in _sa(nome_servico):
        return "refil"
    return nome_servico or "?"


def _rastreio_da_os(field: FieldClient, order_id: str):
    """Busca o form 'Código de rastreio.' do refil. Devolve (pares, preenchido)."""
    pares: list[tuple[str, str]] = []
    preenchido = False
    for fm in field.listar_formularios_os(order_id):
        if fm.get("archived"):
            continue
        eh_rastreio = "rastre" in _sa(fm.get("name") or "")
        if FORMS_SOMENTE_REFIL and not eh_rastreio:
            continue
        det = field.recuperar_formulario_os(order_id, fm["id"])
        for q in det.get("questions", []):
            valor = "" if q.get("answer") is None else str(q["answer"])
            pares.append((f"{fm.get('name')} — {q.get('title')}", valor))
            if valor.strip() and eh_rastreio:
                preenchido = True
    return pares, preenchido


def _status(tipo: str, archived: bool, task_done: bool,
            completed_em: str | None, rastreio_ok: bool):
    """Deriva (status, concluida_em) — ver tabela na docstring do módulo."""
    if archived:
        return "inativa", None
    if tipo == "refil":
        if rastreio_ok:
            return "concluida", completed_em
        if task_done:
            return "em_execucao", completed_em  # enviado mas sem código → dias_sem_rastreio
        return "pendente", None
    if task_done:
        return "concluida", completed_em
    return "pendente", None


def _processar_os(field: FieldClient, supa: SupabaseClient, servicos: dict, o: dict):
    """Processa UMA OS (thread-safe). Devolve (updatedAt, ok)."""
    codigo = str(o["id"])
    upd = o.get("updatedAt")
    cliente_codigo = str((o.get("customer") or {}).get("id") or "")
    if not cliente_codigo:
        return upd, False

    tipo = _tipo_os(servicos.get((o.get("service") or {}).get("id"), ""))
    eh_refil = tipo == "refil"
    archived = bool(o.get("archived"))

    # status real via tasks
    try:
        tasks = field.listar_tasks_os(codigo)
    except Exception as e:  # noqa: BLE001
        logger.warning("tasks da OS %s falharam: %s", codigo, e)
        tasks = []
    done = [t for t in tasks if t.get("status") == "done"]
    task_done = bool(done)
    completed_em = max((t["completedAt"] for t in done if t.get("completedAt")), default=None)
    # mês de referência = mês PLANEJADO (scheduling.date da task) -> completedAt -> createdAt.
    # createdAt sozinho erra: a operação cria o refil no mês ANTERIOR ao envio.
    sched = next(((t.get("scheduling") or {}).get("date") for t in tasks
                  if (t.get("scheduling") or {}).get("date")), None)
    mes_ref = (sched or completed_em or o.get("createdAt") or "")[:10] or None

    # rastreio (só refil)
    pares, rastreio_ok = ([], False)
    if eh_refil and not archived:
        try:
            pares, rastreio_ok = _rastreio_da_os(field, codigo)
        except Exception as e:  # noqa: BLE001
            logger.warning("rastreio da OS %s falhou: %s", codigo, e)

    status, concluida_em = _status(tipo, archived, task_done, completed_em, rastreio_ok)

    try:
        os_id = supa.upsert_os(codigo, cliente_codigo, tipo, status, o.get("createdAt"),
                               concluida_em, mes_referencia=mes_ref)
    except Exception as e:  # noqa: BLE001
        logger.warning("upsert OS %s falhou: %s", codigo, e)
        return upd, False

    if archived:
        return upd, True  # inativa: não gasta chamadas em sub-recursos

    # etiquetas da OS
    try:
        supa.delete("os_etiquetas", {"os_id": f"eq.{os_id}"})
        for lab in field.listar_etiquetas_os(codigo):
            etq_id = supa.upsert_etiqueta(str(lab.get("id") or lab["name"]),
                                          normalizar_etiqueta(lab["name"]), "os")
            supa.insert("os_etiquetas", [{"os_id": os_id, "etiqueta_id": etq_id}],
                        upsert=True, on_conflict="os_id,etiqueta_id")
    except Exception as e:  # noqa: BLE001
        logger.warning("etiquetas da OS %s falharam: %s", codigo, e)

    # respostas_form: sempre limpa (consistência); insere só o rastreio do refil
    try:
        supa.delete("respostas_form", {"os_id": f"eq.{os_id}"})
        if pares:
            supa.insert("respostas_form", [{"os_id": os_id, "campo": c, "valor": v} for c, v in pares])
    except Exception as e:  # noqa: BLE001
        logger.warning("respostas_form da OS %s falharam: %s", codigo, e)

    # comentários
    try:
        supa.delete("comentarios", {"os_id": f"eq.{os_id}"})
        for com in field.listar_comentarios_os(codigo):
            texto = com.get("text") or com.get("message") or com.get("comment") or ""
            if not texto.strip():
                continue
            autor = com.get("author")
            autor = autor.get("name") if isinstance(autor, dict) else autor
            supa.insert("comentarios", [{
                "codigo_field": str(com.get("id") or f"{codigo}|{com.get('createdAt')}"),
                "os_id": os_id, "texto": texto, "autor": autor,
                "data_comentario": com.get("createdAt"),
            }], upsert=True, on_conflict="codigo_field")
    except Exception as e:  # noqa: BLE001
        logger.warning("comentários da OS %s falharam: %s", codigo, e)

    return upd, True


def sync(field: FieldClient, supa: SupabaseClient, since: str | None = None,
         workers: int | None = None) -> int:
    workers = workers or int(os.environ.get("SYNC_WORKERS", "6"))
    erro = None
    maior_updated = since
    processados = falhas = 0

    try:
        servicos = {s["id"]: s.get("name", "") for s in field.listar_servicos()}
        pendentes = [o for o in field.listar_os()
                     if not (since and o.get("updatedAt") and o["updatedAt"] <= since)]
        total = len(pendentes)
        logger.info("OS a processar: %d (workers=%d, since=%s, forms_so_refil=%s)",
                    total, workers, since, FORMS_SOMENTE_REFIL)

        with ThreadPoolExecutor(max_workers=workers) as ex:
            for i, (upd, ok) in enumerate(
                    ex.map(lambda o: _processar_os(field, supa, servicos, o), pendentes), 1):
                if ok:
                    processados += 1
                    maior_updated = _maxts(maior_updated, upd)
                else:
                    falhas += 1
                if i % 500 == 0:
                    logger.info("  %d/%d (%d ok, %d falhas)...", i, total, processados, falhas)

        logger.info("OS sincronizadas: %d (falhas: %d)", processados, falhas)
    except Exception as e:  # noqa: BLE001
        erro = str(e)
        logger.exception("Erro no sync de OS")
        raise
    finally:
        supa.registrar_sync("ordens_servico", maior_updated, processados, erro)
    return processados


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    with FieldClient() as f, SupabaseClient() as s:
        state = s.get_sync_state("ordens_servico")
        sync(f, s, since=state["ultimo_updated_at"] if state else None)
