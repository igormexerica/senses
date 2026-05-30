"""
sync_clientes.py — Clientes + etiquetas de cliente (Field -> Supabase).

Etiquetas vêm de GET /customers/{id}/labels (escopo 'cliente'). O nome é gravado
NORMALIZADO (slug minúsculo/ASCII) porque as views casam os canônicos exatos:
'presencial', 'remoto', 'onboarding', 'conexao', 'consolidacao', 'fidelizado-dna',
'growth', 'premium', 'star', 'super-star'. Ver DESCOBERTAS-API.md (decisão D1).

O vínculo cliente<->etiqueta é refeito a cada sync (apaga e recria) pra refletir
trocas manuais de tag que a gestora faz no Field.
"""
from __future__ import annotations

import logging
import unicodedata
from datetime import datetime, timezone

from field_client import FieldClient
from supabase_client import SupabaseClient

logger = logging.getLogger("sync_clientes")


def normalizar_etiqueta(nome: str) -> str:
    """Nome de label do Field -> slug canônico.

    'Fidelizado - DNA' -> 'fidelizado-dna', 'Super Star' -> 'super-star',
    'Conexão' -> 'conexao', 'Presencial' -> 'presencial'."""
    s = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode()
    return s.lower().strip().replace(" - ", "-").replace(" ", "-")


def _data_inicio(cliente: dict) -> str | None:
    """data_inicio_contrato = createdAt truncado pra DATE (decisão D5).

    Suposição validável: o cadastro no Field ~ início de contrato. Fallback:
    statistics.service.firstAt (1a OS)."""
    ts = cliente.get("createdAt") or (cliente.get("statistics", {})
                                      .get("service", {}) or {}).get("firstAt")
    return ts[:10] if ts else None


def sync(field: FieldClient, supa: SupabaseClient) -> int:
    processados = 0
    erro = None
    try:
        logger.info("Sincronizando clientes...")
        for cli in field.listar_clientes():
            codigo = str(cli["id"])
            nome = cli.get("name") or "(sem nome)"
            ativo = not cli.get("archived", False)
            cliente_id = supa.upsert_cliente(codigo, nome, _data_inicio(cli), ativo)

            try:
                labels = field.listar_etiquetas_cliente(codigo)
            except Exception as e:
                logger.warning("labels do cliente %s falharam: %s", codigo, e)
                labels = []

            # refaz os vínculos do zero (reflete remoção/troca de tag no Field)
            supa.delete("cliente_etiquetas", {"cliente_id": f"eq.{cliente_id}"})
            for lab in labels:
                cod_lab = str(lab.get("id") or lab["name"])
                etq_id = supa.upsert_etiqueta(cod_lab, normalizar_etiqueta(lab["name"]), "cliente")
                supa.insert("cliente_etiquetas",
                            [{"cliente_id": cliente_id, "etiqueta_id": etq_id}],
                            upsert=True, on_conflict="cliente_id,etiqueta_id")

            processados += 1
            if processados % 100 == 0:
                logger.info("  %d clientes...", processados)
        logger.info("Clientes sincronizados: %d", processados)
    except Exception as e:
        erro = str(e)
        logger.exception("Erro no sync de clientes")
        raise
    finally:
        supa.registrar_sync("clientes", datetime.now(timezone.utc).isoformat(), processados, erro)
    return processados


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    with FieldClient() as f, SupabaseClient() as s:
        sync(f, s)
