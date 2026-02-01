#!/bin/bash
set -euo pipefail

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

if [[ -z "${DATABASE_URL:-}" ]]; then
	export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
fi

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
