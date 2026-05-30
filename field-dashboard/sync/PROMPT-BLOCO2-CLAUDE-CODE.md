# Briefing — Bloco 2: Sync Python (Field Control → Supabase) + Agente Classificador

Você é um engenheiro Python sênior pareando com Igor (Business Automation Architect na Senses Olfacts). O **bloco 1** já está pronto: Supabase self-hosted rodando no Contabo com o schema `field` (tabelas, views, functions) aplicado. Agora vamos construir a camada de sincronização de dados e o agente de classificação.

## Estado atual (já feito no bloco 1)

- Supabase self-hosted rodando em Docker no Contabo, schema `field` populado com:
  - Tabelas: `clientes`, `cliente_etiquetas`, `etiquetas`, `ordens_servico`, `os_etiquetas`, `respostas_form`, `avaliacoes`, `comentarios`, `expectativas`, `classificacao_agente`, `sync_state`
  - Views: `v_clientes_segmentados`, `v_gaps_priorizados`, `v_cobertura_mensal`, `v_refis_sem_rastreio`, `v_avaliacoes_criticas`, `v_comentarios_para_analise`, `v_alertas_pendentes`, `v_audit_jornada`
  - Functions: `gerar_expectativas_mes()`, `match_expectativas_os()`, `upsert_cliente()`, `upsert_etiqueta()`, `upsert_os()`, `registrar_sync()`
- Kong exposto em `localhost:8000` (e via `https://supabase.ifops.com.br` pelo Cloudflare Tunnel)
- SERVICE_ROLE_KEY e ANON_KEY salvos no password manager do Igor

## Arquivos fornecidos (já neste diretório)

Código Python pronto pra revisar e testar:
- `requirements.txt`
- `.env.example`
- `field_client.py` — wrapper da API do Field Control
- `supabase_client.py` — wrapper do Supabase/PostgREST
- `sync_clientes.py`, `sync_os.py`, `sync_avaliacoes.py` — syncs por recurso
- `run_sync.py` — orquestrador
- `agente_classificador.py` — agente Claude
- `04-pgcron.sql` — agendamento das functions internas
- `systemd/` — services e timers

## Objetivo do bloco 2

Ao final:
1. Ambiente Python virtual criado e dependências instaladas.
2. `.env` preenchido (Igor fornece as chaves).
3. **Endpoints da API do Field validados** — este é o ponto crítico (ver abaixo).
4. Sync rodando: dados reais do Field aparecendo nas tabelas do Supabase.
5. Expectativas geradas e matched (gaps aparecendo na `v_gaps_priorizados`).
6. Agente classificando comentários/avaliações.
7. Timers systemd ativos (sync 30min, agente 1h) + pg_cron agendado.

## ⚠️ Ponto crítico: nomes de endpoints e campos da API do Field

O código foi escrito com base na **documentação** do Field (https://developers.fieldcontrol.com.br/), mas a doc lista recursos em português enquanto os paths reais podem ser em inglês (ex: a doc mostra `GET /services`). **Os nomes de endpoint e os campos do JSON precisam ser confirmados contra a API real antes de confiar no sync.**

Por isso, a PRIMEIRA tarefa não é rodar o sync inteiro — é fazer chamadas exploratórias e ajustar o código ao formato real.

### Etapa de descoberta (faça ANTES de tudo)

Com a `FIELD_API_KEY` no `.env`, crie um script temporário `explore.py` que faz UMA chamada a cada endpoint e imprime a estrutura (chaves do primeiro item de cada lista). Exemplo:

```python
import os, json
from dotenv import load_dotenv
import httpx
load_dotenv()

base = os.environ["FIELD_BASE_URL"]
key = os.environ["FIELD_API_KEY"]
h = {"X-Api-Key": key, "Accept": "application/json"}

# Testa cada endpoint candidato e mostra o que volta
for path in ["customers", "clientes", "orders", "ordens", "tags", "etiquetas", "reviews", "avaliacoes"]:
    try:
        r = httpx.get(f"{base}/{path}", headers=h, params={"limit": 1}, timeout=20)
        print(f"\n=== /{path} → {r.status_code} ===")
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            print("totalCount:", data.get("totalCount"))
            if items:
                print("chaves do item:", list(items[0].keys()))
                print(json.dumps(items[0], indent=2, ensure_ascii=False)[:800])
    except Exception as e:
        print(f"/{path} → ERRO: {e}")
```

Rode, veja quais paths respondem 200, e **mostre o output pro Igor**. Com base nisso:
- Corrija os paths em `field_client.py` (ex: se for `/customers` e não `/clientes`)
- Corrija os nomes de campo nos `sync_*.py` (ex: o campo de data, o nome do cliente, o tipo da OS)
- **Crucial**: descubra o nome real do campo de código de rastreio nos formulários. Pegue uma OS de refil real e inspecione `GET /orders/{id}/forms`. O código assume que o campo contém "rastreio" ou "rastreamento" — confirme ou ajuste a função `match_expectativas_os` e os índices.

Documente o que descobriu num arquivo `DESCOBERTAS-API.md` pro Igor ter referência.

## Fluxo de trabalho

### Etapa 1 — Ambiente

```bash
cd /opt/senses/field-dashboard/sync
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
```

Peça ao Igor pra preencher `.env` com:
- `FIELD_API_KEY` (ele gera no painel do Field)
- `SUPABASE_SERVICE_ROLE_KEY` (do password manager)
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` (use `http://localhost:8000` se rodar no mesmo host do Supabase)

### Etapa 2 — Descoberta da API (ver seção crítica acima)

Não pule. Ajuste o código ao formato real antes de prosseguir.

### Etapa 3 — Validar conexão com Supabase

Antes do sync completo, teste que o `supabase_client` consegue ler e escrever:

```python
from supabase_client import SupabaseClient
with SupabaseClient() as s:
    print(s.select("clientes", {"limit": "1"}))   # deve retornar [] sem erro
    print(s.rpc("gerar_expectativas_mes", {}))     # deve retornar [{...}]
```

Se der erro de schema (`field` não encontrado), confirme que o PostgREST está exposto pro schema `field` — pode precisar adicionar `field` ao `PGRST_DB_SCHEMAS` no `.env` do Supabase (docker) e reiniciar o container `supabase-rest`. Por padrão é `public, storage, graphql_public`. Ajuste pra `public, storage, graphql_public, field` e `docker compose restart rest`.

### Etapa 4 — Sync de teste (pequeno)

Rode primeiro com um teto baixo pra não puxar tudo:
- Temporariamente limite o sync a uns 10 clientes (pode comentar o resto ou adicionar um break)
- Rode `python sync_clientes.py` isolado
- Verifique no Supabase Studio que os clientes e etiquetas apareceram
- Confira a `v_clientes_segmentados` — modalidade/jornada/tier estão sendo derivados certo?

### Etapa 5 — Sync completo

```bash
python run_sync.py --full
```

Acompanhe os logs. Depois verifique:
```sql
SELECT COUNT(*) FROM field.clientes;
SELECT COUNT(*) FROM field.ordens_servico;
SELECT COUNT(*) FROM field.respostas_form WHERE campo ILIKE '%rastreio%';
SELECT * FROM field.v_clientes_segmentados LIMIT 10;
```

### Etapa 6 — Gerar expectativas e matched

```sql
SELECT * FROM field.gerar_expectativas_mes();
SELECT * FROM field.match_expectativas_os();
SELECT * FROM field.v_gaps_priorizados LIMIT 20;
SELECT * FROM field.v_cobertura_mensal;
SELECT * FROM field.v_refis_sem_rastreio;
```

Mostre os resultados pro Igor. Aqui ele vai validar se os gaps fazem sentido com a realidade da operação dele.

### Etapa 7 — Agente classificador

```bash
python agente_classificador.py
```

Verifique:
```sql
SELECT criticidade, COUNT(*) FROM field.classificacao_agente GROUP BY criticidade;
SELECT * FROM field.v_alertas_pendentes;
```

### Etapa 8 — Agendar (só depois que tudo funcionar manualmente)

```bash
# pg_cron
docker exec -i supabase-db psql -U postgres -d postgres < 04-pgcron.sql

# systemd timers
sudo cp systemd/*.service systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now field-sync.timer field-agente.timer
systemctl list-timers | grep field
```

## Restrições

- **Não comite o `.env`.** Confirme `.gitignore` cobrindo `.env`, `.venv/`, `__pycache__/`.
- **Não invente nomes de campo.** Se a estrutura da API não bater com o código, ajuste com base no retorno real, não em suposição. Documente em DESCOBERTAS-API.md.
- **Respeite rate limits do Field.** O `field_client.py` já tem backoff; se tomar muitos 429, aumente os intervalos antes de insistir.
- **Sync incremental depende de `updatedAt`.** Se a API do Field não tiver filtro por data, o sync vai sempre fazer full — documente isso e a gente otimiza depois.
- **Não exponha a SERVICE_ROLE_KEY** em logs ou arquivos versionados.

## Em caso de erro

Mostre: comando exato, traceback completo, sua hipótese, e 2 opções ranqueadas. Não improvise correções de schema sem confirmar com o Igor.

## Critério de "feito"

- `v_clientes_segmentados` retorna clientes com modalidade/jornada/tier corretos
- `v_gaps_priorizados` mostra gaps reais ranqueados por criticidade
- `v_refis_sem_rastreio` identifica refis sem código
- Agente classificou ao menos alguns comentários/avaliações
- Timers ativos e pg_cron agendado
- `DESCOBERTAS-API.md` documenta o formato real da API

---

**Comece pela Etapa 1, depois a descoberta da API (Etapa 2). Não rode o sync completo antes de validar os endpoints reais.**
