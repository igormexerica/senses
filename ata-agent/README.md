# Agente de Ata de Reunião — Casa Senses

Transforma a **transcrição** de uma reunião semanal de status em uma **ata executiva
de 1 página** (markdown + JSON), curta e acionável. Foco: reuniões do e-commerce B2C
da Casa Senses (Igor + CEO + Gestor de Marketing).

Resolve a dor real: ninguém reescuta 40 min de reunião. O que circula e cobra
encaminhamentos é a ata de 1 página — este agente faz esse destilamento.

## Princípio nº 1: fidelidade à transcrição

O agente **nunca inventa**. O que não foi dito vira `[a definir]` (texto) ou `null`
(número) e é listado em **Pontos a Confirmar** para o Igor validar antes de enviar.

## Dois blocos que NÃO se confundem

- **Pontos a Confirmar** — lacunas factuais (o que faltou ser dito). Fazem parte da ata.
- **Observações do Agente** — leitura/análise própria do agente (riscos, conflitos,
  action item sem responsável). **Uso interno do Igor. NUNCA circula na ata.** São
  renderizadas num apêndice separado, depois de um divisor `⛔ não incluir no envio`.

## Instalação

```bash
cd ata-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # runtime
# pip install -r requirements-dev.txt    # runtime + pytest (para rodar testes)
cp .env.example .env   # e preencha ANTHROPIC_API_KEY
```

## Uso

```bash
# A partir de um arquivo de transcrição
python -m src.cli --transcricao reuniao_2026-06-09.txt --data 2026-06-09 --out ata.md

# Via stdin, gravando também o JSON
cat transcricao.txt | python -m src.cli --data 2026-06-09 --stdin --out ata.md --json ata.json

# Participantes explícitos (opcional; senão, infere da transcrição)
python -m src.cli --transcricao r.txt --data 2026-06-09 \
  --participantes "Igor Oliveira,Marina,Rafael" --out ata.md
```

Sem `--out`, a ata vai para o stdout.

## Teste

```bash
pip install -r requirements-dev.txt
pytest -q
```

Os testes **não usam a rede** (a chamada ao modelo é injetada), então rodam sem
`ANTHROPIC_API_KEY`. Cobrem: defaults `[a definir]`, parsing/retry de JSON e — o mais
importante — que as observações do agente **nunca** vazam para o corpo da ata.

## Docker

```bash
docker build -t ata-agent .
docker run --rm -i -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ata-agent --data 2026-06-09 --stdin < reuniao.txt > ata.md
```

## Modelo

`claude-opus-4-8` (qualidade de síntese), `temperature=0` para fidelidade.

## Estrutura

```
src/schemas.py   contrato pydantic (Ata, ActionItem, Decisao, Bloqueio)
src/prompts.py   system prompt + montagem da mensagem do usuário
src/agent.py     chamada à API Anthropic (isolada p/ testes)
src/ata.py       gerar_ata(): transcrição -> Ata validada (com retry)
src/render.py    Ata -> markdown de 1 página (com separação das observações)
src/cli.py       interface de linha de comando
```

## Roadmap (pós-v1, não implementado)

- Ler transcrição direto do Google Drive (Doc do Meet mais recente).
- Enviar a ata por WhatsApp (Evolution) / e-mail.
- Criar o Google Doc da ata na pasta do projeto.
- Histórico de atas (Supabase) e comparação semana a semana.
