"""Função principal: transcrição -> objeto Ata validado."""

from __future__ import annotations

import json
from typing import Callable

from .agent import completar
from .prompts import build_user_message
from .schemas import Ata


def _extract_json(text: str) -> str:
    """Extrai o PRIMEIRO objeto JSON completo, tolerando cercas ```json e prosa em volta.

    Usa raw_decode (a partir da primeira chave) em vez de rfind('}'), para não
    capturar texto após o objeto caso o modelo acrescente comentários com '}'.
    """
    s = text.strip()
    if s.startswith("```"):
        # remove a primeira linha de cerca (``` ou ```json) e a cerca final
        s = s.split("\n", 1)[-1] if "\n" in s else s
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    start = s.find("{")
    if start == -1:
        raise ValueError("Nenhum objeto JSON encontrado na resposta do modelo.")
    obj, _ = json.JSONDecoder().raw_decode(s[start:])
    return json.dumps(obj, ensure_ascii=False)


def gerar_ata(
    transcricao: str,
    data: str,
    participantes: list[str] | None = None,
    *,
    _completar: Callable[[str], str] = completar,
) -> Ata:
    """Recebe transcrição + data e retorna um objeto `Ata` (pydantic) validado.

    1. Monta a mensagem do usuário com schema + transcrição.
    2. Chama o modelo.
    3. Faz parse seguro do JSON. Se falhar, re-tenta 1x exigindo 'apenas JSON válido'.
    4. Valida no schema pydantic e retorna.

    `_completar` é injetável para testes (substitui a chamada de rede por um stub).
    """
    user = build_user_message(transcricao, data, participantes)

    raw = _completar(user)
    try:
        return Ata.model_validate_json(_extract_json(raw))
    except Exception:
        retry = (
            user
            + "\n\nSua resposta anterior não pôde ser interpretada. "
            "Responda AGORA apenas com JSON válido no schema, sem nenhum texto extra."
        )
        raw = _completar(retry)
        return Ata.model_validate_json(_extract_json(raw))
