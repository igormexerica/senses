"""
run_sync.py — Orquestra todos os syncs na ordem correta de dependência.

Ordem importa:
1. clientes (+ etiquetas) — base de tudo
2. OS (+ etiquetas os + formulários + comentários) — depende de clientes
3. avaliações — depende de OS

Uso:
    python run_sync.py            # incremental (usa sync_state)
    python run_sync.py --full     # ignora sync_state, recarrega tudo
"""
from __future__ import annotations

import sys
import os
import logging
import argparse
from datetime import datetime, timezone

from dotenv import load_dotenv

from field_client import FieldClient
from supabase_client import SupabaseClient
import sync_clientes
import sync_equipamentos
import sync_os
import sync_avaliacoes


def _horas_desde_sync(supa: SupabaseClient, recurso: str) -> float | None:
    """Horas desde o último sync do recurso (None se nunca sincronizado)."""
    st = supa.get_sync_state(recurso)
    ult = st.get("ultimo_sync_em") if st else None
    if not ult:
        return None
    try:
        last = datetime.fromisoformat(ult.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - last).total_seconds() / 3600
    except Exception:
        return None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("run_sync")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true",
                        help="Recarrega tudo, ignora sync_state")
    args = parser.parse_args()

    load_dotenv()
    inicio = datetime.now(timezone.utc)
    logger.info("=== SYNC INICIADO (%s) ===", "FULL" if args.full else "incremental")

    with FieldClient() as field, SupabaseClient() as supa:
        # 1. Clientes — full, mas só ~1x a cada CLIENTES_MIN_HORAS (mudam pouco;
        #    evita ~10min de full a cada 30min). --full ignora o gate.
        rodar_clientes = True
        if not args.full:
            st = supa.get_sync_state("clientes")
            ult = st.get("ultimo_sync_em") if st else None
            if ult:
                try:
                    last = datetime.fromisoformat(ult.replace("Z", "+00:00"))
                    horas = (datetime.now(timezone.utc) - last).total_seconds() / 3600
                    min_h = float(os.environ.get("CLIENTES_MIN_HORAS", "6"))
                    if horas < min_h:
                        rodar_clientes = False
                        logger.info("[SKIP] clientes — sincronizado há %.1fh (< %sh)", horas, min_h)
                except Exception:
                    logger.warning("gate de clientes falhou; rodando full por segurança")
        if rodar_clientes:
            try:
                n = sync_clientes.sync(field, supa)
                logger.info("[OK] clientes: %d", n)
            except Exception:
                logger.exception("[FALHA] clientes — abortando (OS depende de clientes)")
                sys.exit(1)

        # 1b. Equipamentos (inventário). /equipments não tem updatedAt -> full
        #     sempre, então gateia por hora (mudam pouco). Depende de clientes
        #     pra resolver cliente_id. Falha aqui NÃO aborta o resto.
        rodar_equip = True
        if not args.full:
            horas = _horas_desde_sync(supa, "equipamentos")
            if horas is not None:
                min_h = float(os.environ.get("EQUIP_MIN_HORAS", "6"))
                if horas < min_h:
                    rodar_equip = False
                    logger.info("[SKIP] equipamentos — sincronizado há %.1fh (< %sh)", horas, min_h)
        if rodar_equip:
            try:
                n = sync_equipamentos.sync(field, supa)
                logger.info("[OK] equipamentos: %d", n)
            except Exception:
                logger.exception("[FALHA] equipamentos — seguindo mesmo assim")

        # 2. OS
        try:
            since = None
            if not args.full:
                state = supa.get_sync_state("ordens_servico")
                since = state["ultimo_updated_at"] if state else None
            n = sync_os.sync(field, supa, since=since)
            logger.info("[OK] OS: %d", n)
        except Exception:
            logger.exception("[FALHA] OS — seguindo pra avaliações mesmo assim")

        # 3. Avaliações (incremental)
        try:
            since_av = None
            if not args.full:
                state = supa.get_sync_state("avaliacoes")
                since_av = state["ultimo_updated_at"] if state else None
            n = sync_avaliacoes.sync(field, supa, since=since_av)
            logger.info("[OK] avaliações: %d", n)
        except Exception:
            logger.exception("[FALHA] avaliações")

    dur = (datetime.now(timezone.utc) - inicio).total_seconds()
    logger.info("=== SYNC CONCLUÍDO em %.1fs ===", dur)


if __name__ == "__main__":
    main()
