"""
sync_equipamentos.py — Inventário de máquinas (Field -> Supabase).

Fonte: GET /equipments (~2328). A API NÃO filtra por cliente (?customer= é
ignorado) e não há /customers/{id}/equipments -> varre tudo e agrupa por
customer.id no banco (via cliente_codigo_field). `updatedAt` vem sempre null
-> não dá incremental por data; o run_sync gateia por hora (full barato: só
um upsert por equip, sem sub-chamadas).

modelo/cor são DERIVADOS do `name` aqui no ingest. ~65% dos names trazem o
modelo ("SENSES BRISA - BRANCA"); o resto foi nomeado pela localização física
no Field ("RECEPÇÃO", "BANHEIRO", ".") -> modelo NULL, mas a máquina é contada.
Ver DESCOBERTAS-API.md (seção /equipments).
"""
from __future__ import annotations

import os
import re
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from field_client import FieldClient
from supabase_client import SupabaseClient

logger = logging.getLogger("sync_equipamentos")

# cobre as grafias reais ("BRANCA"/"PRETA") e os erros comuns de digitação
# vistos no Field ("BRACA", "BRANCO"/"PRETO").
_COR_RE = re.compile(r"(BRANC[AO]|BRAC[AO]|PRET[AO])", re.I)


def parse_modelo_cor(name: str | None) -> tuple[str | None, str | None]:
    """Deriva (modelo, cor) do name do equipamento.

    O modelo é o 1º segmento depois de "SENSES" e antes de " - "; o resto é
    cor ("BRANCA"/"PRETA") ou ruído de localização (descartado). Nomes que não
    começam com SENSES (ex.: "RECEPÇÃO", ".") -> (None, None) = não identificado.

    >>> parse_modelo_cor("SENSES BRISA - BRANCA")   -> ("BRISA", "BRANCA")
    >>> parse_modelo_cor("SENSES NIMBUS II - PRETA")-> ("NIMBUS II", "PRETA")
    >>> parse_modelo_cor("SENSES NEBULA - BRACA")   -> ("NEBULA", "BRANCA")  # typo
    >>> parse_modelo_cor("SENSES BRUMA - ENTRADA")  -> ("BRUMA", None)       # ruído
    >>> parse_modelo_cor("SENSES BRISA")            -> ("BRISA", None)
    >>> parse_modelo_cor("RECEPÇÃO")                -> (None, None)
    """
    s = re.sub(r"\s+", " ", (name or "").strip())
    if not re.match(r"^SENSES\b", s, re.I):
        return None, None
    body = re.sub(r"^SENSES\b\s*", "", s, flags=re.I).strip(" -.")
    if not body:
        return None, None
    parts = re.split(r"\s*-\s*", body)
    modelo = re.sub(r"\s+", " ", parts[0].strip()).upper() or None
    cor = None
    if len(parts) > 1:
        m = _COR_RE.search(parts[-1])
        if m:
            cor = "BRANCA" if m.group(1).upper().startswith("BRA") else "PRETA"
    # cor também aparece grudada como último token do modelo, sem hífen
    # ("SENSES BRISA BRANCA"): destaca pra não virar um modelo "BRISA BRANCA".
    if modelo and " " in modelo:
        head, last = modelo.rsplit(" ", 1)
        if head and _COR_RE.fullmatch(last):
            if cor is None:
                cor = "BRANCA" if last.startswith("BRA") else "PRETA"
            modelo = head
    return modelo, cor


def _processar(supa: SupabaseClient, eq: dict) -> str:
    """Upsert de um equipamento. Devolve 'ativo' | 'arquivado'."""
    codigo = str(eq["id"])
    cust = str((eq.get("customer") or {}).get("id") or "") or None
    loc = str((eq.get("location") or {}).get("id") or "") or None
    archived = bool(eq.get("archived", False))
    modelo, cor = parse_modelo_cor(eq.get("name"))
    supa.upsert_equipamento(
        codigo_field=codigo,
        cliente_codigo=cust,
        nome=eq.get("name"),
        modelo=modelo,
        cor=cor,
        numero=str(eq.get("number")) if eq.get("number") is not None else None,
        location_codigo=loc,
        archived=archived,
    )
    return "arquivado" if archived else "ativo"


def sync(field: FieldClient, supa: SupabaseClient, workers: int | None = None) -> int:
    workers = workers or int(os.environ.get("SYNC_WORKERS", "6"))
    erro = None
    ativos = arquivados = 0
    try:
        equips = list(field.listar_equipamentos())
        logger.info("Equipamentos: %d no Field (workers=%d)", len(equips), workers)
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for res in ex.map(lambda e: _processar(supa, e), equips):
                if res == "arquivado":
                    arquivados += 1
                else:
                    ativos += 1
        logger.info("Equipamentos sincronizados: %d ativos | %d arquivados", ativos, arquivados)
    except Exception as e:  # noqa: BLE001
        erro = str(e)
        logger.exception("Erro no sync de equipamentos")
        raise
    finally:
        supa.registrar_sync("equipamentos",
                            datetime.now(timezone.utc).isoformat(),
                            ativos + arquivados, erro)
    return ativos + arquivados


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    with FieldClient() as f, SupabaseClient() as s:
        sync(f, s)
