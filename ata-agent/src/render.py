"""Renderização JSON (Ata) -> markdown de 1 página.

REGRA CRÍTICA: `observacoes_do_agente` NUNCA entra no corpo da ata oficial.
Ela é renderizada num apêndice separado, depois de um divisor que avisa
explicitamente para não incluir no envio ao CEO.
"""

from __future__ import annotations

from .schemas import Ata, StatusGeral

_RAG_LABEL = {
    "green": "🟢 Green",
    "amber": "🟠 Amber",
    "red": "🔴 Red",
}
_RAG_DOT = {"green": "🟢", "amber": "🟠", "red": "🔴"}

# Divisor que separa a ata oficial das observações internas do Igor.
SEPARADOR = "— — —  ⛔ não incluir no envio ao CEO  — — —"


def _status_block(s: StatusGeral) -> list[str]:
    rag = _RAG_LABEL.get(s.rag or "", "[a definir]")
    pct = f"{s.conclusao_pct:g}%" if s.conclusao_pct is not None else "[a definir]"
    no_prazo = s.no_prazo or "[a definir]"
    linhas = [
        "## Status Geral",
        f"- **Farol (RAG):** {rag}",
        f"- **Conclusão:** {pct}",
        f"- **No prazo:** {no_prazo}",
    ]
    if s.resumo:
        linhas.append(f"\n> {s.resumo}")
    return linhas


def render_ata_oficial(ata: Ata) -> str:
    """Apenas a ata que circula. Termina em 'Pontos a Confirmar'.

    Use esta função quando o Igor quiser copiar só a ata, sem as observações.
    """
    L: list[str] = []
    L.append("# 📋 Ata de Reunião — Casa Senses (E-commerce B2C)")
    L.append("")
    L.append(f"**Data:** {ata.data}  ")
    participantes = ", ".join(ata.participantes) if ata.participantes else "[a definir]"
    L.append(f"**Participantes:** {participantes}")
    L.append("")

    L.extend(_status_block(ata.status_geral))
    L.append("")

    L.append("## ✅ Avanços da Semana")
    if ata.avancos:
        L.extend(f"- {a}" for a in ata.avancos)
    else:
        L.append("- [a definir]")
    L.append("")

    L.append("## 🤝 Decisões Tomadas")
    if ata.decisoes:
        for d in ata.decisoes:
            L.append(f"- **{d.decisao}** _(decidido por: {d.quem_decidiu})_")
    else:
        L.append("- Nenhuma decisão fechada nesta reunião.")
    L.append("")

    L.append("## 🚧 Bloqueios")
    if ata.bloqueios:
        for b in ata.bloqueios:
            dot = _RAG_DOT.get(b.status or "", "⚪")
            L.append(f"- {dot} **{b.item}** — precisa de: {b.precisa_de}")
    else:
        L.append("- Nenhum bloqueio reportado.")
    L.append("")

    L.append("## 🎯 Action Items")
    if ata.action_items:
        L.append("| Ação | Responsável | Prazo |")
        L.append("| --- | --- | --- |")
        for ai in ata.action_items:
            L.append(f"| {ai.acao} | {ai.responsavel} | {ai.prazo} |")
    else:
        L.append("- Nenhum action item registrado.")
    L.append("")

    L.append("## ➡️ Próximos Passos")
    if ata.proximos_passos:
        L.extend(f"- {p}" for p in ata.proximos_passos)
    else:
        L.append("- [a definir]")
    L.append("")

    L.append("## ⚠️ Pontos a Confirmar")
    if ata.pontos_a_confirmar:
        L.extend(f"- {p}" for p in ata.pontos_a_confirmar)
    else:
        L.append("- Nenhum ponto pendente de confirmação.")

    return "\n".join(L)


def render_observacoes(ata: Ata) -> str:
    """Apêndice de observações internas (uso exclusivo do Igor)."""
    L: list[str] = []
    L.append("---")
    L.append("")
    L.append(f"**{SEPARADOR}**")
    L.append("")
    L.append("## 💡 Observações do Agente (uso interno do Igor)")
    L.append("")
    L.append("> Leitura/análise do agente para preparar o follow-up. **Não faz parte")
    L.append("> da ata** e não deve ser enviada ao CEO nem ao Marketing.")
    L.append("")
    if ata.observacoes_do_agente:
        L.extend(f"- {o}" for o in ata.observacoes_do_agente)
    else:
        L.append("- (sem observações)")
    return "\n".join(L)


def render_markdown(ata: Ata) -> str:
    """Documento completo: ata oficial + divisor + observações do agente.

    O corpo da ata termina em 'Pontos a Confirmar'. As observações vêm depois,
    visualmente separadas, para que o Igor possa copiar só a ata.
    """
    return render_ata_oficial(ata) + "\n\n" + render_observacoes(ata) + "\n"
