"""
agente_classificador.py — O "olho da operação".

Lê comentários técnicos e avaliações ainda não classificados, manda pro
Claude analisar, e grava criticidade + ação sugerida + sumário em
field.classificacao_agente.

NÃO dispara Telegram nesta versão — os críticos aparecem no dashboard via
a view v_alertas_pendentes. Pra ligar Telegram depois, ver alertas.py.
"""
from __future__ import annotations

import os
import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from anthropic import Anthropic

from supabase_client import SupabaseClient

logger = logging.getLogger("agente")

SYSTEM_PROMPT = """Você é um analista de Customer Success de uma empresa de \
aromatização de ambientes (perfumação corporativa). Sua função é ler comentários \
técnicos e avaliações de clientes e classificar a criticidade para a operação.

Contexto da operação:
- Clientes presenciais recebem visita mensal de um técnico.
- Clientes remotos recebem refil a cada dois meses (logística envia).
- Tiers de contrato: growth < premium < star < super-star.
- Estágio de jornada: onboarding (0-6m) > conexao (7-12m) > consolidacao (1-2a) > fidelizado-dna (2a+).
  Clientes em onboarding têm maior risco de churn.

Classifique cada item em uma destas criticidades:
- "critico": problema grave, risco imediato de churn ou insatisfação séria. Requer ação em 24h.
- "alto": problema relevante que precisa de atenção em poucos dias.
- "medio": ponto de melhoria, sem urgência.
- "estavel": comentário neutro ou positivo, nenhuma ação necessária.

Responda SOMENTE com um JSON válido, sem markdown, neste formato exato:
{"criticidade": "critico|alto|medio|estavel", "acao_sugerida": "string curta e acionável", "sumario": "resumo em uma frase do que o cliente relatou"}"""


def _classificar(client: Anthropic, modelo: str, contexto: str, texto: str) -> dict:
    msg = client.messages.create(
        model=modelo,
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"{contexto}\n\nTexto a classificar:\n\"{texto}\"",
        }],
    )
    raw = "".join(b.text for b in msg.content if b.type == "text").strip()
    # remove eventuais cercas de markdown
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Resposta não-JSON do modelo: %s", raw[:200])
        return {"criticidade": "medio", "acao_sugerida": "Revisar manualmente",
                "sumario": texto[:120]}


def _ja_classificado(supa: SupabaseClient, fonte_tipo: str, fonte_id: str) -> bool:
    rows = supa.select("classificacao_agente", {
        "fonte_tipo": f"eq.{fonte_tipo}",
        "fonte_id": f"eq.{fonte_id}",
        "limit": "1",
    })
    return bool(rows)


def processar_comentarios(supa: SupabaseClient, client: Anthropic, modelo: str) -> int:
    n = 0
    pendentes = supa.select("v_comentarios_para_analise", {"limit": "50"})
    for c in pendentes:
        contexto = (f"Cliente: {c.get('cliente_nome')} | "
                    f"Tier: {c.get('tier')} | Jornada: {c.get('jornada_atual')}")
        resultado = _classificar(client, modelo, contexto, c["texto"])
        supa.insert("classificacao_agente", [{
            "fonte_tipo": "comentario",
            "fonte_id": c["comentario_id"],
            "criticidade": resultado.get("criticidade", "medio"),
            "acao_sugerida": resultado.get("acao_sugerida"),
            "sumario": resultado.get("sumario"),
            "modelo": modelo,
        }])
        n += 1
        logger.info("Comentário %s → %s", c["comentario_id"], resultado.get("criticidade"))
    return n


def processar_avaliacoes(supa: SupabaseClient, client: Anthropic, modelo: str) -> int:
    n = 0
    # avaliações críticas (nota <=3) ainda não classificadas
    criticas = supa.select("v_avaliacoes_criticas", {"limit": "50"})
    for a in criticas:
        if a.get("classificacao_agente"):  # já analisada
            continue
        contexto = (f"Cliente: {a.get('cliente_nome')} | Tier: {a.get('tier')} | "
                    f"Jornada: {a.get('jornada_atual')} | Nota: {a.get('nota')}/5")
        texto = a.get("comentario") or f"Avaliação com nota {a.get('nota')} sem comentário"
        resultado = _classificar(client, modelo, contexto, texto)
        supa.insert("classificacao_agente", [{
            "fonte_tipo": "avaliacao",
            "fonte_id": a["avaliacao_id"],
            "criticidade": resultado.get("criticidade", "alto"),
            "acao_sugerida": resultado.get("acao_sugerida"),
            "sumario": resultado.get("sumario"),
            "modelo": modelo,
        }])
        n += 1
        logger.info("Avaliação %s (nota %s) → %s",
                    a["avaliacao_id"], a.get("nota"), resultado.get("criticidade"))
    return n


def main():
    load_dotenv()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    modelo = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
    client = Anthropic()  # lê ANTHROPIC_API_KEY do ambiente

    logger.info("=== AGENTE CLASSIFICADOR INICIADO ===")
    with SupabaseClient() as supa:
        nc = processar_comentarios(supa, client, modelo)
        na = processar_avaliacoes(supa, client, modelo)
    logger.info("=== FIM: %d comentários, %d avaliações classificados ===", nc, na)


if __name__ == "__main__":
    main()
