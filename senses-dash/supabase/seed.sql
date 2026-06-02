-- Casa Senses · Dashboard — seed inicial (migra o estado hardcoded do Dashboard.jsx).
-- Rode DEPOIS de schema.sql. Idempotente: limpa antes de inserir.

truncate subtasks, tasks, decisions restart identity cascade;

-- ---------- decisions (coluna "Reunião" começa vazia, por design) ------------
insert into decisions (title, area, owner, stage, rag, note, position) values
  ('Confirmar Nuvemshop como plataforma B2C', 'Plataforma', 'senses', 'Concluído', 'green', 'Decidido: manter Nuvemshop (Casa Senses).', 0),
  ('Centralizar credenciais e acessos (admin, domínio, DNS)', 'Plataforma', 'senses', 'A fazer', 'amber', 'Você deve ser o dono dos acessos, não a terceirizada.', 1),
  ('Definir ambiente de homologação x produção', 'Plataforma', 'terc', 'A fazer', 'green', '', 2),
  ('Definir domínio — gruposenses + casa senses complementares', 'Plataforma', 'senses', 'Em andamento', 'red', 'PENDÊNCIA Fase 1. Destrava a Yesdev. Arquitetura de marca/domínio.', 3),
  ('Curadoria do sortimento B2C inicial', 'Catálogo', 'senses', 'A fazer', 'amber', 'O que do portfólio B2B vai ao consumidor final.', 4),
  ('Padrão de ficha de produto (atributos olfativos, fotos, vídeo)', 'Catálogo', 'senses', 'A fazer', 'green', 'Família olfativa, notas, ocasião.', 5),
  ('Produção de conteúdo (descrições / fotos)', 'Catálogo', 'senses', 'A fazer', 'green', 'Possível usar agente de IA próprio.', 6),
  ('Política de preço B2C + regra de frete grátis', 'Pricing & Fiscal', 'senses', 'A fazer', 'amber', '', 7),
  ('Emissão de NF-e, ICMS-ST perfumaria/cosmético', 'Pricing & Fiscal', 'senses', 'Em andamento', 'red', 'PRIORIDADE nº 1 das frentes ativas. Reunião com contador.', 8),
  ('Gateway, meios de pagamento e antifraude', 'Pagamento', 'senses', 'A fazer', 'green', 'Pix, cartão, parcelamento.', 9),
  ('Definir fulfillment — OBSERVAR (depto em reestruturação)', 'Logística & Estoque', 'senses', 'Bloqueado', 'red', 'Modo observar/aguardar. Não propor agora. Manter CEO ciente.', 10),
  ('Transportadoras, frete e reversa', 'Logística & Estoque', 'senses', 'A fazer', 'red', 'Aguardando reestruturação do depto.', 11),
  ('Embalagem e unboxing (proteção de fragrância)', 'Logística & Estoque', 'senses', 'A fazer', 'amber', 'Terracota em massa, textura tátil (manual de marca).', 12),
  ('Canais de atendimento (WhatsApp/Evolution, e-mail/Resend)', 'Pós-venda & CX', 'senses', 'Em andamento', 'green', 'Stack já existente.', 13),
  ('SLA de atendimento, trocas e rastreio', 'Pós-venda & CX', 'senses', 'A fazer', 'green', '', 14),
  ('Integrar recuperação de carrinho ao novo site', 'Marketing & Aquisição', 'senses', 'Em andamento', 'green', 'Automação n8n já rodando.', 15),
  ('Plano de lançamento + tráfego pago', 'Marketing & Aquisição', 'senses', 'A fazer', 'green', 'Verba dedicada confirmada.', 16),
  ('Analytics: GA4, pixel, eventos de conversão', 'Marketing & Aquisição', 'terc', 'A fazer', 'amber', '', 17),
  ('Lançar @casasenses (perfil B2C separado)', 'Marketing & Aquisição', 'senses', 'A fazer', 'amber', 'Tom B2C; identidade Terracota; agentes de triagem/conteúdo.', 18),
  ('Alinhar comunicação B2C com a empresa de tráfego (hoje B2B/leads)', 'Marketing & Aquisição', 'senses', 'A fazer', 'amber', 'PENDÊNCIA Fase 1.', 19),
  ('Definir burn (verba de mídia paga) para B2C', 'Marketing & Aquisição', 'senses', 'A fazer', 'amber', 'PENDÊNCIA Fase 1. Verba confirmada; falta dimensionar.', 20),
  ('Termos de uso, privacidade, LGPD', 'Jurídico & Compliance', 'senses', 'A fazer', 'amber', '', 21),
  ('Regras Anvisa / cosméticos se aplicável', 'Jurídico & Compliance', 'senses', 'A fazer', 'amber', '', 22);

-- ---------- tasks (uuids fixos para ligar as subtasks) -----------------------
insert into tasks (id, phase, title, owner, week, dur, rag, position) values
  ('11111111-1111-4111-8111-000000000001', 'Fase 1 · Criação & Dev (30 dias)', 'E-commerce + loja Mercado Livre — Yesdev', 'terc', 0, 4, 'green', 0),
  ('11111111-1111-4111-8111-000000000002', 'Fase 1 · Pendências do Igor (destravam a Yesdev)', 'Decisões que o Igor precisa resolver na Fase 1', 'senses', 0, 4, 'red', 1),
  ('11111111-1111-4111-8111-000000000004', 'Conteúdo', 'Curadoria de sortimento (Senses)', 'senses', 1, 2, 'amber', 2),
  ('11111111-1111-4111-8111-000000000005', 'Conteúdo', 'Fichas de produto + fotos (Senses)', 'senses', 3, 3, 'green', 3),
  ('11111111-1111-4111-8111-000000000006', 'Fiscal', 'Definição fiscal / NF-e (Senses + contador)', 'senses', 0, 4, 'red', 4),
  ('11111111-1111-4111-8111-000000000007', 'Desenvolvimento', 'Integrações (pagamento, frete, analytics)', 'terc', 4, 3, 'amber', 5),
  ('11111111-1111-4111-8111-000000000009', 'Desenvolvimento', 'Carga de catálogo + fichas', 'senses', 6, 2, 'green', 6),
  ('11111111-1111-4111-8111-000000000010', 'Homologação', 'Testes e homologação (QA)', 'terc', 7, 2, 'amber', 7),
  ('11111111-1111-4111-8111-000000000011', 'Lançamento', 'Go-live + campanha de lançamento', 'senses', 9, 1, 'green', 8);

-- ---------- subtasks ---------------------------------------------------------
insert into subtasks (task_id, title, who, status, approval, position) values
  ('11111111-1111-4111-8111-000000000001', 'Desenvolvimento do e-commerce (Nuvemshop)', 'Yesdev', 'doing', 'pending', 0),
  ('11111111-1111-4111-8111-000000000001', 'Criação da loja no Mercado Livre', 'Yesdev', 'todo', 'pending', 1),
  ('11111111-1111-4111-8111-000000000002', 'Definir domínio — gruposenses e casa senses complementares', 'Igor', 'doing', 'pending', 0),
  ('11111111-1111-4111-8111-000000000002', 'Alinhar com a empresa de tráfego (hoje B2B/leads) a comunicação B2C', 'Igor', 'todo', 'pending', 1),
  ('11111111-1111-4111-8111-000000000002', 'Definir burn (verba de mídia paga) para B2C', 'Igor', 'todo', 'pending', 2),
  ('11111111-1111-4111-8111-000000000004', 'Lista de produtos B2C definida', 'Senses', 'doing', 'pending', 0),
  ('11111111-1111-4111-8111-000000000005', 'Rodar agente de descrição', 'Senses', 'todo', 'pending', 0),
  ('11111111-1111-4111-8111-000000000005', 'Banco de fotos organizado', 'Senses', 'todo', 'pending', 1),
  ('11111111-1111-4111-8111-000000000006', 'Reunião com contador', 'Senses', 'doing', 'pending', 0),
  ('11111111-1111-4111-8111-000000000006', 'Definir emissor integrado à Nuvemshop', 'Senses', 'todo', 'pending', 1);
