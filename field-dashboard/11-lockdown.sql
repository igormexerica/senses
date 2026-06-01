-- =========================================================================
-- Field Control Dashboard - Lockdown da leitura anon (porta de trás)
-- Rode por ÚLTIMO (depois de 02..10). Idempotente.
-- =========================================================================
-- O dashboard está atrás do login (basic auth), mas o PostgREST público
-- (supabase.ifops.com.br) NÃO está — e a anon key (semi-pública) lia todo o
-- schema `field` (nomes de clientes, cobertura, avaliações...). O dashboard
-- passou a ler via SERVICE_ROLE server-side (lib/field.ts), então o anon não
-- precisa mais de SELECT. Aqui revogamos tudo.
--
-- ATENÇÃO: este arquivo DESFAZ os `GRANT SELECT ... TO anon` dos outros .sql.
-- Se reaplicar 02/05/06/07/09, rode 11 de novo no fim.
-- =========================================================================

SET search_path TO field, public;

REVOKE SELECT ON ALL TABLES IN SCHEMA field FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA field REVOKE SELECT ON TABLES FROM anon;

-- authenticated fica como está: exige um JWT role=authenticated assinado com o
-- segredo do projeto (não existe usuário Supabase aqui), então não é exposto
-- pela anon key. O vetor real era só o anon.
