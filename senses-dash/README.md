# Casa Senses · Dashboard de Gestão do Projeto

Dashboard de gestão do projeto e-commerce B2C: decisões (com coluna **Reunião**), cronograma (Gantt), tarefas da agência e visão executiva. **Backend Supabase** (Postgres + Auth + RLS) — estado sincronizado entre dispositivos (PC, celular, TV da sala de reunião). Identidade visual Senses (Terracota, Playfair Display + Inter Tight).

## Como funciona

- **Login** (Supabase Auth, e-mail/senha) antes do dashboard. Sessão persiste entre refreshes; botão **Sair** no header.
- **Board de decisões** com 5 colunas: **Reunião · A fazer · Em andamento · Bloqueado · Concluído**. A coluna Reunião é a primeira — pautas a decidir com CEO/marketing, decididas ao vivo e movidas para frente.
- **CRUD de cards** pela interface: criar (`+ Novo card`), editar (clique no card), excluir (✕, com confirmação), mover/reordenar (**arraste** o card entre colunas e dentro da coluna; ◀▶ continua como atalho/fallback touch). Tudo persiste no Supabase na hora (optimistic update; reverte e avisa se a escrita falhar).
  - O arraste fica disponível na visão **Todas**; com filtro de área ativo, use ◀▶ (evita reposicionar cards ocultos de outras áreas).
- **Cronograma**: clique numa barra do Gantt para abrir as tarefas da entrega (CRUD de subtarefas, status, aprovação, link, data).
- **Sincronização ao vivo** (Supabase Realtime): mudanças aparecem em outras telas/dispositivos abertos sem refresh — útil com várias telas na reunião.
- Sem `localStorage` — a fonte de verdade é o Supabase.

## Setup do Igor (uma vez)

1. **Supabase** — o dashboard usa o **projeto senses** já existente (`SUPABASE_URL` do `/root/senses/.env`).
2. No **SQL Editor** do Supabase, rode na ordem:
   - `supabase/schema.sql` (tabelas `decisions`, `tasks`, `subtasks` + RLS)
   - `supabase/seed.sql` (popula com o estado atual do projeto)
3. **Authentication → Users → Add user**: crie o usuário (e-mail/senha) do Igor — e do CEO, se quiser. Não há cadastro público (uso interno).
4. **Env vars** — copie `.env.example` para `.env` e preencha:
   - `VITE_SUPABASE_URL` (já vem com a URL do projeto senses)
   - `VITE_SUPABASE_ANON_KEY` → Supabase → **Settings → API → Project API keys → `anon` `public`**
5. Na **Vercel**, defina as mesmas duas env vars em **Settings → Environment Variables**.

> A `anon` key é pública por design — a segurança vem do **RLS** (só usuário autenticado lê/escreve). Nunca use a `service_role` key no frontend.

## Rodar localmente

```bash
npm install
npm run dev    # http://localhost:5173
```

## Publicar no Vercel

Projeto já linkado (`.vercel/project.json` → `senses-dash`).

```bash
npm install
vercel --prod   # publica e devolve a URL
```

Ou via Git: `git push` → a Vercel republica sozinha. A Vercel detecta Vite (build `npm run build`, output `dist`).

> **Mudança da v2:** o acesso antes era HTTP Basic Auth via `middleware.js` (Vercel Edge, `BASIC_AUTH_USER/PASS`). Isso foi **substituído por Supabase Auth**. O `middleware.js` foi removido; pode apagar as env vars `BASIC_AUTH_*` na Vercel.

## Estrutura

```
src/
  supabaseClient.js     client (anon key) — null-safe se faltar env
  theme.js              objeto de cores T, STATUS, STAGES, OWNERS…
  auth/Login.jsx        tela de login
  hooks/
    useAuth.js          sessão, logout
    useDecisions.js     CRUD decisions (optimistic + revert)
    useTasks.js         tasks + subtasks
  components/
    Board.jsx           colunas do board (inclui Reunião)
    DecisionCard.jsx    card + editar/excluir/mover
    CardForm.jsx        form criar/editar
    Gantt.jsx           cronograma
  Dashboard.jsx         orquestra gate de auth + abas + TaskPanel
supabase/
  schema.sql            tabelas + RLS + triggers
  seed.sql              estado inicial migrado
```

## Onde editar

- Cores da marca: objeto `T` em `src/theme.js`.
- Dados não são mais hardcoded — vivem no Supabase. O conteúdo inicial está em `supabase/seed.sql`.

## Roadmap (não implementado)

- Reordenar via arraste também com filtro de área ativo (hoje só na visão "Todas").
- Arraste com suporte a toque (a API nativa HTML5 cobre desktop; touch usa ◀▶).
