"""
notificar_alertas.py — empurra os alertas críticos do CS via Telegram.

Lê field.v_alertas_pendentes (classificações críticas do agente ainda não
disparadas), manda no Telegram do gestor e marca classificacao_agente.alertou_em
pra não repetir. Sem TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID_GESTOR_CS roda em
DRY-RUN (só loga o que enviaria, sem marcar). Agendado por systemd
(field-alertas.timer), depois do agente.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

from supabase_client import SupabaseClient

logger = logging.getLogger("notificar_alertas")

_EMOJI = {"critico": "🔴", "alto": "🟠", "medio": "🟡", "estavel": "🟢"}


def formatar(a: dict) -> str:
    emoji = _EMOJI.get((a.get("criticidade") or "").lower(), "⚠️")
    linhas = [f"{emoji} *Alerta {(a.get('criticidade') or '').upper()}* · {a.get('fonte_tipo', '')}"]
    if a.get("sumario"):
        linhas.append(a["sumario"])
    if a.get("acao_sugerida"):
        linhas.append(f"➡️ {a['acao_sugerida']}")
    return "\n".join(linhas)


def enviar_telegram(token: str, chat_id: str, texto: str) -> None:
    r = httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": texto, "parse_mode": "Markdown"},
        timeout=20,
    )
    r.raise_for_status()


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID_GESTOR_CS", "").strip()
    dry = not (token and chat)

    with SupabaseClient() as supa:
        alertas = supa.select("v_alertas_pendentes", {"order": "processado_em.asc", "limit": "50"})
        if not alertas:
            logger.info("Sem alertas pendentes.")
            return

        logger.info("%d alerta(s) pendente(s)%s", len(alertas),
                    " — DRY-RUN (sem TELEGRAM_BOT_TOKEN/CHAT)" if dry else "")
        enviados = 0
        for a in alertas:
            texto = formatar(a)
            if dry:
                logger.info("[DRY] enviaria:\n%s\n", texto)
                continue
            try:
                enviar_telegram(token, chat, texto)
            except Exception as e:  # noqa: BLE001
                logger.warning("falha no envio do alerta %s: %s", a.get("id"), e)
                continue
            # só marca quem realmente foi enviado (dry-run deixa pendente)
            supa.patch("classificacao_agente", {"id": f"eq.{a['id']}"},
                       {"alertou_em": datetime.now(timezone.utc).isoformat()})
            enviados += 1

        logger.info("Alertas enviados: %d%s", enviados,
                    " (dry-run não marca alertou_em)" if dry else "")


if __name__ == "__main__":
    main()
