"""Camada de chamada à API da Anthropic.

Isolada de propósito: `ata.gerar_ata` injeta esta função, e os testes a
substituem por um stub sem tocar na rede.
"""

from __future__ import annotations

import os

from anthropic import Anthropic

from .prompts import SYSTEM_PROMPT

DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_MAX_TOKENS = 4096


def _client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY não definida. Configure no ambiente ou em .env "
            "(veja .env.example)."
        )
    return Anthropic(api_key=api_key)


def completar(
    user_message: str,
    *,
    system: str = SYSTEM_PROMPT,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """Envia a mensagem do usuário e devolve o texto da resposta do modelo.

    temperature=0 prioriza fidelidade à transcrição sobre criatividade.
    """
    resp = _client().messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0,  # fidelidade > criatividade
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    return "".join(
        block.text for block in resp.content if getattr(block, "type", None) == "text"
    )
