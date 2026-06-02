"""Contrato de dados da ata (pydantic v2).

Campos textuais não ditos na reunião assumem o sentinela "[a definir]";
campos numéricos não ditos ficam None. Nunca supor.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

RAG = Literal["green", "amber", "red"]

ND = "[a definir]"  # sentinela padrão para informação faltante


def _na_se_vazio(v: str) -> str:
    """Coage string vazia / só-espaços para o sentinela.

    Defesa em código além do prompt: se o modelo ecoar "" (em vez de omitir o
    campo), ainda assim a renderização não mostra lacuna em branco.
    """
    return v if (v and v.strip()) else ND


class StatusGeral(BaseModel):
    conclusao_pct: Optional[float] = None
    rag: Optional[RAG] = None
    no_prazo: Optional[str] = None
    resumo: str = ""


class Decisao(BaseModel):
    decisao: str
    quem_decidiu: str = ND

    @field_validator("quem_decidiu")
    @classmethod
    def _coage(cls, v: str) -> str:
        return _na_se_vazio(v)


class Bloqueio(BaseModel):
    item: str
    precisa_de: str = ND
    status: Optional[RAG] = None

    @field_validator("precisa_de")
    @classmethod
    def _coage(cls, v: str) -> str:
        return _na_se_vazio(v)


class ActionItem(BaseModel):
    acao: str
    responsavel: str = ND
    prazo: str = ND

    @field_validator("responsavel", "prazo")
    @classmethod
    def _coage(cls, v: str) -> str:
        return _na_se_vazio(v)


class Ata(BaseModel):
    data: str
    participantes: list[str] = Field(default_factory=list)
    status_geral: StatusGeral = Field(default_factory=StatusGeral)
    avancos: list[str] = Field(default_factory=list)
    decisoes: list[Decisao] = Field(default_factory=list)
    bloqueios: list[Bloqueio] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    proximos_passos: list[str] = Field(default_factory=list)
    pontos_a_confirmar: list[str] = Field(default_factory=list)
    # Leitura/análise PRÓPRIA do agente — uso interno do Igor.
    # NUNCA faz parte da ata oficial que circula.
    observacoes_do_agente: list[str] = Field(default_factory=list)
