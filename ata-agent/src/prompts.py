"""System prompt do agente + construção da mensagem do usuário."""

from __future__ import annotations

import json

SYSTEM_PROMPT = """\
Você transforma a transcrição de uma reunião semanal de status em uma ata executiva
curta e acionável. O projeto é o e-commerce B2C da Casa Senses, gerido por Igor
Oliveira, apresentado ao CEO e ao Gestor de Marketing.

REGRAS:
- Português do Brasil, tom profissional e objetivo.
- A ata cabe em 1 página. Não transcreva a conversa — destile.
- Extraia APENAS o que foi efetivamente dito. NUNCA invente decisões, prazos ou nomes.
- Se uma informação não aparece na transcrição (ex.: prazo de um action item),
  escreva "[a definir]" em vez de supor.
- Diferencie claramente: decisão TOMADA (fechada) vs. pendência (em aberto).
- Logística/estoque é o risco nº 1 do projeto: se citado, destaque em bloqueios.
- Não inclua detalhe técnico irrelevante para CEO/marketing.
- Para cada action item, identifique responsável e prazo SOMENTE se ditos.

SAÍDA:
- Responda SEMPRE em JSON válido no schema fornecido na mensagem do usuário.
- Sem markdown, sem preâmbulo, apenas o JSON.
- Ao final, popule "pontos_a_confirmar" com qualquer item ambíguo ou faltante que
  o Igor deveria validar antes de enviar a ata.
- Campos numéricos não ditos (ex.: conclusao_pct) ficam null.

OBSERVAÇÕES DO AGENTE (campo "observacoes_do_agente"):
- Aqui — e SOMENTE aqui — você pode tecer análise própria, não apenas relatar.
- Sinalize: action items sem responsável, decisões que parecem conflitar entre si,
  pendências que dependem de um risco conhecido (ex.: logística), prazos que parecem
  apertados frente às pendências em aberto.
- Seja útil e direto, no máximo 3-5 observações. É material de preparação do Igor.
- ATENÇÃO: estas observações são SUA leitura, não o que foi dito na reunião. Elas
  NUNCA devem ser apresentadas como parte da ata oficial. Mantenha-as exclusivamente
  neste campo. Não repita nada delas dentro das outras seções factuais.
"""

# Esqueleto do schema enviado ao modelo. Valores são ilustrativos do TIPO esperado;
# o modelo deve substituí-los pelo conteúdo real (ou "[a definir]" / null).
_SCHEMA_SKELETON = {
    "data": "AAAA-MM-DD",
    "participantes": [],
    "status_geral": {
        "conclusao_pct": None,
        "rag": "green|amber|red",
        "no_prazo": "",
        "resumo": "",
    },
    "avancos": [],
    "decisoes": [{"decisao": "", "quem_decidiu": "[a definir]"}],
    "bloqueios": [{"item": "", "precisa_de": "[a definir]", "status": "green|amber|red"}],
    "action_items": [{"acao": "", "responsavel": "[a definir]", "prazo": "[a definir]"}],
    "proximos_passos": [],
    "pontos_a_confirmar": [],
    "observacoes_do_agente": [],
}


def build_user_message(
    transcricao: str,
    data: str,
    participantes: list[str] | None = None,
) -> str:
    """Monta a mensagem do usuário com data, participantes, schema e transcrição."""
    partes: list[str] = [f"DATA DA REUNIÃO: {data}"]

    if participantes:
        partes.append("PARTICIPANTES: " + ", ".join(participantes))
    else:
        partes.append(
            "PARTICIPANTES: [não informados — infira da transcrição; "
            "marque com '[a definir]' quem não for identificável]"
        )

    skeleton = json.dumps(_SCHEMA_SKELETON, ensure_ascii=False, indent=2)
    partes.append("\nPreencha EXATAMENTE este schema JSON (mesmas chaves):")
    partes.append("```json\n" + skeleton + "\n```")

    partes.append(
        "\nREGRAS DE PREENCHIMENTO:\n"
        "- 'data' deve ser a data informada acima.\n"
        '- Informação textual não dita -> "[a definir]".\n'
        "- Campo numérico não dito (conclusao_pct) -> null.\n"
        "- 'rag' e 'status' usam apenas green, amber ou red (ou null se não houver base).\n"
        "- Responda APENAS com o JSON preenchido, sem cercas de código e sem comentários."
    )

    partes.append('\nTRANSCRIÇÃO:\n"""\n' + transcricao.strip() + '\n"""')

    return "\n".join(partes)
