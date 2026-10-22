#!/usr/bin/env bash
# Sourced after dotenv loading by the E2E webserver.
# Playwright gates must be deterministic and must not depend on whatever DATABASE_URL
# happens to be configured in a developer's .env.local (which can point to production).
# Priority for Playwright runtime:
#   1) E2E_DATABASE_URL / E2E_DATABASE_URL_RLS
#   2) Explicitly inherited DATABASE_URL / DATABASE_URL_RLS from caller shell
#   3) Local Supabase default
if [[ "${PLAYWRIGHT:-}" == "1" ]]; then
	if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
		export DATABASE_URL="${E2E_DATABASE_URL}"
	elif [[ -n "${INHERITED_DATABASE_URL:-}" ]]; then
		export DATABASE_URL="${INHERITED_DATABASE_URL}"
	else
		export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
	fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
	export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
fi

if [[ "${PLAYWRIGHT:-}" == "1" ]]; then
	if [[ -n "${E2E_DATABASE_URL_RLS:-}" ]]; then
		export DATABASE_URL_RLS="${E2E_DATABASE_URL_RLS}"
	else
		# Keep RLS/admin reads on the same deterministic DB unless explicitly overridden for E2E.
		export DATABASE_URL_RLS="${DATABASE_URL}"
	fi
elif [[ -n "${E2E_DATABASE_URL_RLS:-}" ]]; then
	export DATABASE_URL_RLS="${E2E_DATABASE_URL_RLS}"
elif [[ -n "${INHERITED_DATABASE_URL_RLS:-}" ]]; then
	export DATABASE_URL_RLS="${INHERITED_DATABASE_URL_RLS}"
elif [[ -z "${DATABASE_URL_RLS:-}" ]]; then
	export DATABASE_URL_RLS="${DATABASE_URL}"
fi

# Test fixtures may use an administrative driver; every spawned app keeps its LOGIN.
if [[ -n "${PW_APP_DATABASE_URL+x}${PW_APP_DATABASE_URL_RLS+x}${PW_APP_DB_RLS_ROLE+x}" ]]; then
	node "${ROOT_DIR}/scripts/ci/validate-playwright-application.mjs"
	export DATABASE_URL_RLS="${PW_APP_DATABASE_URL_RLS}"
	export E2E_DATABASE_URL_RLS="${PW_APP_DATABASE_URL_RLS}"
	export DB_RLS_ROLE="${PW_APP_DB_RLS_ROLE}"
fi

