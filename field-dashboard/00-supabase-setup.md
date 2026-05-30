# Setup Supabase self-hosted no Contabo

Você já tem Docker rodando no Contabo, então o caminho é direto. O Supabase oficial fornece um docker-compose pronto.

## 1. Preparar o ambiente

```bash
ssh root@seu-contabo
cd /opt

# Clone shallow para economizar espaço
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copia o template de variáveis
cp .env.example .env
```

## 2. Gerar segredos

Antes de editar o `.env`, gere os valores que vai precisar:

```bash
# Senha do Postgres (anota num lugar seguro)
openssl rand -base64 32

# JWT secret (mínimo 32 caracteres)
openssl rand -base64 48

# Senha do Dashboard Studio
openssl rand -base64 20
```

Para gerar `ANON_KEY` e `SERVICE_ROLE_KEY` a partir do `JWT_SECRET`, use o gerador oficial:
https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

Cola o `JWT_SECRET` lá, ele te devolve as duas keys assinadas.

## 3. Editar o .env

Os valores que importam de verdade:

```env
# Postgres
POSTGRES_PASSWORD=<sua-senha-forte>
POSTGRES_PORT=5432
POSTGRES_DB=postgres

# JWT
JWT_SECRET=<seu-jwt-secret-48-chars>
ANON_KEY=<gerado-no-passo-anterior>
SERVICE_ROLE_KEY=<gerado-no-passo-anterior>
JWT_EXPIRY=3600

# Dashboard Studio
DASHBOARD_USERNAME=igor
DASHBOARD_PASSWORD=<senha-forte-do-dashboard>

# URLs públicas (use seu domínio real depois)
SITE_URL=https://supabase.ifops.com.br
API_EXTERNAL_URL=https://supabase.ifops.com.br
SUPABASE_PUBLIC_URL=https://supabase.ifops.com.br

# Kong (gateway)
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# Studio
STUDIO_PORT=3000

# SMTP - deixa default por enquanto, só você e gestora vão usar
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=
SMTP_ADMIN_EMAIL=
```

## 4. Verificar conflito de portas no seu Contabo

Você já tem n8n, Evolution API, PostgreSQL, Redis rodando. Conflitos possíveis:

```bash
# Ver o que está usando as portas que o Supabase quer
netstat -tlnp | grep -E '5432|8000|3000|8443'
```

Se 5432 já estiver ocupado pelo seu Postgres existente (provável), muda no .env:

```env
POSTGRES_PORT=5433
```

Se 3000 estiver ocupado, muda:

```env
STUDIO_PORT=3001
```

## 5. Subir os containers

```bash
# Puxa as imagens (pode demorar 5-10min na primeira vez)
docker compose pull

# Sobe tudo em background
docker compose up -d

# Verifica
docker compose ps
```

Vai aparecer: `supabase-db`, `supabase-kong`, `supabase-studio`, `supabase-auth`, `supabase-rest`, `supabase-realtime`, `supabase-storage`, `supabase-meta`, `supabase-edge-functions`.

## 6. Acesso

**Dashboard Studio (interface gráfica):**
- http://seu-contabo-ip:3000 (ou 3001 se mudou a porta)
- Login: `igor` / senha que você definiu

**API REST:**
- http://seu-contabo-ip:8000

## 7. Expor via Cloudflare Tunnel (recomendado)

Mais seguro que abrir portas no firewall do Contabo. Você já usa Cloudflare:

```bash
# Instala cloudflared se não tiver
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb

# Cria o tunnel
cloudflared tunnel login
cloudflared tunnel create supabase-ifops
```

No painel Cloudflare, cria os DNS records:
- `supabase.ifops.com.br` → tunnel
- `studio.supabase.ifops.com.br` → tunnel

E no arquivo `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: supabase.ifops.com.br
    service: http://localhost:8000
  - hostname: studio.supabase.ifops.com.br
    service: http://localhost:3000
  - service: http_status:404
```

```bash
cloudflared tunnel route dns supabase-ifops supabase.ifops.com.br
cloudflared tunnel route dns supabase-ifops studio.supabase.ifops.com.br

# Roda como serviço
cloudflared service install
systemctl start cloudflared
systemctl enable cloudflared
```

## 8. Criar o schema do dashboard

Os SQLs do dashboard ficam num schema separado dentro do database padrão. Conecta no Postgres do Supabase:

```bash
# Via Studio: vai em SQL Editor e cola o conteúdo
# Ou via psql direto:
docker exec -it supabase-db psql -U postgres
```

Roda os 3 arquivos SQL na ordem:
1. `01-schema.sql`
2. `02-views.sql`
3. `03-functions.sql`

## 9. Guardar as credenciais

No final você vai ter:
- `SERVICE_ROLE_KEY` — usa no n8n pra escrita (bypassa RLS)
- `ANON_KEY` — usa no dashboard Next.js pra leitura autenticada
- URL da API — `https://supabase.ifops.com.br`

Salva isso no seu password manager. O `SERVICE_ROLE_KEY` é equivalente a senha de root — não vaza.

## Checklist final

- [ ] Containers todos `Up` (saudáveis no `docker compose ps`)
- [ ] Studio acessível
- [ ] Cloudflare Tunnel configurado (se for usar)
- [ ] Schema `field` criado (rodou o 01-schema.sql)
- [ ] Views criadas (rodou o 02-views.sql)
- [ ] Functions criadas (rodou o 03-functions.sql)
- [ ] SERVICE_ROLE_KEY salva no password manager
