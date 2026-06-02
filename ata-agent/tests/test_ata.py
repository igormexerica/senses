"""Testes do agente de ata.

Não tocam na rede: a chamada ao modelo é injetada via `_completar`.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.ata import _extract_json, gerar_ata
from src.render import (
    SEPARADOR,
    render_ata_oficial,
    render_markdown,
    render_observacoes,
)
from src.schemas import ActionItem, Ata, Bloqueio, Decisao, StatusGeral

FIXTURE = Path(__file__).parent / "fixtures" / "transcricao_exemplo.txt"

# Marcador único usado para rastrear vazamento das observações no corpo da ata.
OBS_MARKER = "MARCADOR_OBSERVACAO_INTERNA_XYZ"


def _ata_completa() -> Ata:
    return Ata(
        data="2026-06-09",
        participantes=["Igor Oliveira", "Marina (CEO)", "Rafael (Marketing)"],
        status_geral=StatusGeral(
            conclusao_pct=None, rag="amber", no_prazo="atenção", resumo="Avançando, mas travado em logística e fiscal."
        ),
        avancos=["120 SKUs publicados", "Pagamento em homologação"],
        decisoes=[
            Decisao(decisao="Go-live só após logística definida", quem_decidiu="Marina (CEO)"),
            Decisao(decisao="Domínio será casasenses.com.br", quem_decidiu="Marina (CEO)"),
        ],
        bloqueios=[Bloqueio(item="Logística B2C", precisa_de="reestruturação do fulfillment", status="red")],
        action_items=[
            ActionItem(acao="Apontar domínio com TI", responsavel="Igor", prazo="[a definir]"),
            ActionItem(acao="Enviar textos da campanha", responsavel="Rafael", prazo="2026-06-12"),
        ],
        proximos_passos=["Revisar na próxima semana"],
        pontos_a_confirmar=["Prazo do apontamento de domínio não foi dito"],
        observacoes_do_agente=[
            f"{OBS_MARKER}: action item de domínio ficou sem prazo.",
            "Go-live depende de dois bloqueios simultâneos (logística + fiscal).",
        ],
    )


# --- schema -----------------------------------------------------------------

def test_action_item_defaults_para_a_definir():
    ai = ActionItem(acao="fazer algo")
    assert ai.responsavel == "[a definir]"
    assert ai.prazo == "[a definir]"


def test_conclusao_pct_aceita_null():
    s = StatusGeral()
    assert s.conclusao_pct is None


def test_string_vazia_coage_para_sentinela():
    # modelo pode ecoar "" em vez de omitir; não pode virar lacuna em branco
    assert ActionItem(acao="x", responsavel="", prazo="   ").responsavel == "[a definir]"
    assert ActionItem(acao="x", responsavel="", prazo="   ").prazo == "[a definir]"
    assert Decisao(decisao="d", quem_decidiu="").quem_decidiu == "[a definir]"
    assert Bloqueio(item="i", precisa_de="").precisa_de == "[a definir]"


def test_render_nao_deixa_campo_em_branco_com_string_vazia():
    ata = Ata(
        data="2026-06-09",
        action_items=[ActionItem(acao="apontar domínio", responsavel="", prazo="")],
        decisoes=[Decisao(decisao="usar domínio X", quem_decidiu="")],
    )
    doc = render_ata_oficial(ata)
    assert "| apontar domínio | [a definir] | [a definir] |" in doc
    assert "_(decidido por: [a definir])_" in doc


# --- extração de JSON -------------------------------------------------------

def test_extract_json_remove_cercas():
    raw = '```json\n{"data": "2026-06-09", "avancos": []}\n```'
    assert json.loads(_extract_json(raw))["data"] == "2026-06-09"


def test_extract_json_tolera_ruido_em_volta():
    raw = 'Claro! Aqui está:\n{"data": "x"}\nEspero ter ajudado.'
    assert json.loads(_extract_json(raw)) == {"data": "x"}


# --- render: separação das observações (REGRA CRÍTICA) ----------------------

def test_observacoes_nao_vazam_para_a_ata_oficial():
    ata = _ata_completa()
    oficial = render_ata_oficial(ata)
    assert OBS_MARKER not in oficial
    assert SEPARADOR not in oficial


def test_observacoes_aparecem_apenas_depois_do_separador():
    ata = _ata_completa()
    doc = render_markdown(ata)
    assert SEPARADOR in doc
    assert OBS_MARKER in doc
    assert doc.index(OBS_MARKER) > doc.index(SEPARADOR)


def test_separador_avisa_nao_enviar():
    ata = _ata_completa()
    obs = render_observacoes(ata)
    assert "não incluir no envio" in obs.lower()


def test_render_tem_todas_as_secoes():
    doc = render_ata_oficial(_ata_completa())
    for secao in [
        "Status Geral",
        "Avanços",
        "Decisões Tomadas",
        "Bloqueios",
        "Action Items",
        "Próximos Passos",
        "Pontos a Confirmar",
    ]:
        assert secao in doc, f"faltou seção: {secao}"


def test_corpo_oficial_termina_em_pontos_a_confirmar():
    """O corpo que circula não pode conter o bloco de observações."""
    doc = render_markdown(_ata_completa())
    corpo, _, apendice = doc.partition(SEPARADOR)
    assert "Pontos a Confirmar" in corpo
    assert "Observações do Agente" not in corpo
    assert "Observações do Agente" in apendice


# --- gerar_ata com modelo injetado -----------------------------------------

def _resposta_valida() -> str:
    return json.dumps(
        {
            "data": "2026-06-09",
            "participantes": ["Igor", "Marina", "Rafael"],
            "status_geral": {"conclusao_pct": None, "rag": "amber", "no_prazo": "atenção", "resumo": "ok"},
            "avancos": ["catálogo"],
            "decisoes": [{"decisao": "go-live após logística", "quem_decidiu": "Marina"}],
            "bloqueios": [{"item": "Logística B2C", "precisa_de": "reestruturação", "status": "red"}],
            "action_items": [{"acao": "apontar domínio", "responsavel": "Igor"}],
            "proximos_passos": ["revisar semana que vem"],
            "pontos_a_confirmar": ["prazo do domínio não dito"],
            "observacoes_do_agente": ["domínio sem prazo"],
        },
        ensure_ascii=False,
    )


def test_gerar_ata_parseia_resposta_valida():
    ata = gerar_ata("transcrição qualquer", "2026-06-09", _completar=lambda _u: _resposta_valida())
    assert ata.data == "2026-06-09"
    assert ata.bloqueios[0].item == "Logística B2C"
    # action item sem prazo dito vira sentinela
    assert ata.action_items[0].prazo == "[a definir]"


def test_gerar_ata_retenta_em_json_invalido():
    chamadas = {"n": 0}

    def stub(_user: str) -> str:
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            return "desculpe, não consigo formatar em JSON agora"
        return _resposta_valida()

    ata = gerar_ata("t", "2026-06-09", _completar=stub)
    assert chamadas["n"] == 2
    assert ata.data == "2026-06-09"


# --- fixture existe e é utilizável ------------------------------------------

def test_fixture_existe_e_tem_conteudo():
    texto = FIXTURE.read_text(encoding="utf-8")
    assert "Logística" in texto or "logística" in texto
    assert len(texto) > 200
