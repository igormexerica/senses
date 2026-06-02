-- Casa Senses · Dashboard de Gestão — schema
-- Rode no SQL Editor do Supabase (projeto senses), depois rode seed.sql.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------- Tabelas ----------------------------------------------------------
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null default 'Geral',
  owner text not null default 'senses',        -- 'senses' | 'terc'
  stage text not null default 'A fazer',        -- 'Reunião'|'A fazer'|'Em andamento'|'Bloqueado'|'Concluído'
  rag text not null default 'green',             -- 'green'|'amber'|'red'
  note text default '',
  position int default 0,                        -- ordenação dentro da coluna
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  title text not null,
  owner text not null default 'terc',
  week int not null default 0,
  dur int not null default 1,
  rag text not null default 'green',
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  title text not null,
  who text default '',
  due date,
  status text not null default 'todo',           -- 'todo'|'doing'|'done'
  approval text not null default 'pending',       -- 'pending'|'approved'|'changes'
  link text default '',
  position int default 0,
  created_at timestamptz default now()
);

-- ---------- updated_at automático -------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_decisions_updated on decisions;
create trigger trg_decisions_updated before update on decisions
  for each row execute function set_updated_at();

drop trigger if exists trg_tasks_updated on tasks;
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------------------------------------------
-- Apenas usuários autenticados leem/escrevem.
alter table decisions enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;

drop policy if exists "auth_all_decisions" on decisions;
create policy "auth_all_decisions" on decisions
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_tasks" on tasks;
create policy "auth_all_tasks" on tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_subtasks" on subtasks;
create policy "auth_all_subtasks" on subtasks
  for all to authenticated using (true) with check (true);

-- ---------- Realtime (sincronização ao vivo entre telas) --------------------
-- Adiciona as tabelas à publicação supabase_realtime (idempotente).
do $$ begin
  alter publication supabase_realtime add table decisions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table subtasks;
exception when duplicate_object then null; end $$;
