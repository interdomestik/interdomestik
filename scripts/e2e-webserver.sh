#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
bash "${SCRIPT_DIR}/node-guard.sh"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

cd "${WEB_DIR}"

PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-127.0.0.1}"
BASE_URL="${NEXT_PUBLIC_APP_URL:-http://${HOSTNAME}:${PORT}}"

export NEXT_PUBLIC_APP_URL="${BASE_URL}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-${BASE_URL}}"
export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS:-http://127.0.0.1:${PORT},http://localhost:${PORT},${BASE_URL}}"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
export INTERDOMESTIK_AUTOMATED="${INTERDOMESTIK_AUTOMATED:-1}"
export PLAYWRIGHT="${PLAYWRIGHT:-1}"

load_env_file() {
	local filePath="$1"
	if [[ -f "${filePath}" ]]; then
		set -a
		# shellcheck disable=SC1090
		source "${filePath}"
		set +a
	fi
}

# Standalone `node .next/standalone/.../server.js` does not auto-load .env files.
# Ensure local dev env is available for the runtime server process.

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"
load_env_file "${WEB_DIR}/.env"
load_env_file "${WEB_DIR}/.env.local"

# Always ensure nip.io subdomains are trusted for E2E, even in production
NIPIO_ORIGINS=(
	"http://ks.127.0.0.1.nip.io:3000"
	"http://mk.127.0.0.1.nip.io:3000"
	"http://pilot.127.0.0.1.nip.io:3000"
	"http://app.127.0.0.1.nip.io:3000"
	"http://127.0.0.1.nip.io:3000"
)

IFS=',' read -ra EXISTING_ORIGINS <<< "${BETTER_AUTH_TRUSTED_ORIGINS:-}"
declare -A ORIGIN_SET
for o in "${EXISTING_ORIGINS[@]}"; do
	[[ -n "$o" ]] && ORIGIN_SET["$o"]=1
done
for nipio in "${NIPIO_ORIGINS[@]}"; do
	ORIGIN_SET["$nipio"]=1
done
BETTER_AUTH_TRUSTED_ORIGINS="$(IFS=','; echo "${!ORIGIN_SET[*]}")"
export BETTER_AUTH_TRUSTED_ORIGINS

# Playwright gates must be deterministic and must not depend on whatever DATABASE_URL
# happens to be configured in a developer's .env.local (which can point to production).
# Preserve an explicitly provided DATABASE_URL (CI), allow E2E_DATABASE_URL override,
# and otherwise default to local Supabase.
if [[ "${PLAYWRIGHT:-}" == "1" ]]; then
	if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
		export DATABASE_URL="${E2E_DATABASE_URL}"
	elif [[ -z "${DATABASE_URL:-}" ]]; then
		export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
	fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
	export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
fi

if [[ -z "${DATABASE_URL_RLS:-}" ]]; then
	export DATABASE_URL_RLS="${DATABASE_URL}"
fi

# Increase DB timeouts to prevent negative timeout warnings in slow CI envs
export DB_CONNECT_TIMEOUT=60
export DB_IDLE_TIMEOUT=60
export DB_MAX_LIFETIME=3600

if [[ -z "${BETTER_AUTH_SECRET:-}" ]]; then
	export BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
fi

echo "E2E webserver env:"
echo "  BASE_URL=${BASE_URL}"
echo "  NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
echo "  BETTER_AUTH_URL=${BETTER_AUTH_URL}"
echo "  BETTER_AUTH_TRUSTED_ORIGINS=${BETTER_AUTH_TRUSTED_ORIGINS}"
echo "  HOSTNAME=${HOSTNAME}"
echo "  PORT=${PORT}"

STANDALONE_SERVER="${WEB_DIR}/.next/standalone/apps/web/server.js"
FALLBACK_STANDALONE_SERVER="${WEB_DIR}/.next/standalone/server.js"
STANDALONE_STAMP_FILE="${WEB_DIR}/.next/standalone/.build-stamp.json"
STANDALONE_STATIC_DIR="${WEB_DIR}/.next/standalone/.next/static"
STANDALONE_APP_STATIC_DIR="${WEB_DIR}/.next/standalone/apps/web/.next/static"
BUILD_STATIC_DIR="${WEB_DIR}/.next/static"
STANDALONE_AUTOREBUILD="${STANDALONE_AUTOREBUILD:-true}"
DID_STANDALONE_REBUILD=0
CURRENT_GIT_SHA=""
STAMP_GIT_SHA=""
STAMP_STATUS_REASON=""

if [[ -d "${BUILD_STATIC_DIR}" ]]; then
	mkdir -p "$(dirname "${STANDALONE_STATIC_DIR}")"
	ln -sfn "${BUILD_STATIC_DIR}" "${STANDALONE_STATIC_DIR}"
	mkdir -p "$(dirname "${STANDALONE_APP_STATIC_DIR}")"
	ln -sfn "${BUILD_STATIC_DIR}" "${STANDALONE_APP_STATIC_DIR}"
fi

should_autorebuild() {
	local value
	value="$(printf '%s' "${STANDALONE_AUTOREBUILD}" | tr '[:upper:]' '[:lower:]')"
	case "${value}" in
	false | 0 | no | off)
		return 1
		;;
	*)
		return 0
		;;
	esac
}

refresh_stamp_status() {
	STAMP_STATUS_REASON=""
	STAMP_GIT_SHA=""
	CURRENT_GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)"

	if [[ ! -f "${STANDALONE_STAMP_FILE}" ]]; then
		STAMP_STATUS_REASON="missing-stamp"
		return 1
	fi

	STAMP_GIT_SHA="$(
		node -e "const fs=require('node:fs');const stamp=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(stamp.gitSha ?? '');" "${STANDALONE_STAMP_FILE}" 2>/dev/null || true
	)"

	if [[ -z "${CURRENT_GIT_SHA}" || -z "${STAMP_GIT_SHA}" || "${CURRENT_GIT_SHA}" != "${STAMP_GIT_SHA}" ]]; then
		STAMP_STATUS_REASON="stale-stamp"
		return 1
	fi

	return 0
}

rebuild_standalone_once() {
	if (( DID_STANDALONE_REBUILD == 1 )); then
		return 1
	fi

	if ! should_autorebuild; then
		return 1
	fi

	DID_STANDALONE_REBUILD=1
	echo "⚠️ Standalone artifact ${STAMP_STATUS_REASON} -> rebuilding with build:ci" >&2
	echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
	echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
	pnpm --filter @interdomestik/web run build:ci
	return 0
}

if ! refresh_stamp_status; then
	if rebuild_standalone_once; then
		if ! refresh_stamp_status; then
			echo "❌ Standalone artifact is still invalid after auto-rebuild." >&2
			echo "   reason: ${STAMP_STATUS_REASON}" >&2
			echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
			echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
			echo "   Try: pnpm --filter @interdomestik/web run build:ci" >&2
			exit 1
		fi
	else
		if [[ "${STAMP_STATUS_REASON}" == "missing-stamp" ]]; then
			echo "❌ Missing standalone build stamp: ${STANDALONE_STAMP_FILE}" >&2
		else
			echo "❌ Standalone artifact is stale." >&2
		fi
		echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
		echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
		echo "   Rebuild with: pnpm --filter @interdomestik/web run build:ci" >&2
		echo "   Override: STANDALONE_AUTOREBUILD=true to auto-rebuild once" >&2
		exit 1
	fi
fi

if [[ -f "${STANDALONE_SERVER}" ]]; then
	exec node "${STANDALONE_SERVER}"
fi

if [[ -f "${FALLBACK_STANDALONE_SERVER}" ]]; then
	exec node "${FALLBACK_STANDALONE_SERVER}"
fi

echo "❌ Missing standalone server artifact. Tried:" >&2
echo "   - ${STANDALONE_SERVER}" >&2
echo "   - ${FALLBACK_STANDALONE_SERVER}" >&2
echo "   Run: pnpm --filter @interdomestik/web run build:ci" >&2
echo "   Debug: listing apps/web/.next" >&2
ls -la "${WEB_DIR}/.next" || true
echo "   Debug: listing apps/web/.next/standalone" >&2
ls -la "${WEB_DIR}/.next/standalone" || true
echo "   Debug: find server.js under apps/web/.next (maxdepth 4)" >&2
find "${WEB_DIR}/.next" -maxdepth 4 -name server.js -print || true
exit 1
