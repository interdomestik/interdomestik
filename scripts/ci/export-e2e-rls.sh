#!/usr/bin/env bash
set -euo pipefail

# Only the disposable PostgreSQL service owned by these CI jobs is supported.
expected='postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test'
[[ "${DATABASE_URL:-}" == "$expected" ]] || { echo 'Refusing non-synthetic CI database' >&2; exit 1; }
: "${GITHUB_ENV:?GITHUB_ENV is required}"
rls_role="ci_rls_$(openssl rand -hex 8)"
rls_password="$(openssl rand -hex 32)"
echo "::add-mask::$rls_password"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v rls_role="$rls_role" -v rls_password="$rls_password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'rls_role', :'rls_password') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'rls_role') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'rls_role') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'rls_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'rls_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'rls_role') \gexec
SQL
rls_url="postgresql://${rls_role}:${rls_password}@127.0.0.1:5432/interdomestik_test"
{
  printf 'DATABASE_URL_RLS=%s\n' "$rls_url"
  printf 'E2E_DATABASE_URL_RLS=%s\n' "$rls_url"
  printf 'DB_RLS_ROLE=%s\n' "$rls_role"
} >> "$GITHUB_ENV"
