#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

cd "${WEB_DIR}"

echo "DEBUG: e2e-webserver.sh started"
echo "DEBUG: Working Directory: $(pwd)"
echo "DEBUG: Node Version: $(node -v || echo 'MISSING')"
ls -la || echo "DEBUG: ls failed"

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

# Assume build --filter @interdomestik/web already happened.

# Try nested path first (Monorepo/Turbo typical in some CIs)
STANDALONE_SERVER_NESTED="${WEB_DIR}/.next/standalone/apps/web/server.js"
# Try direct path (Standard Next.js local build)
STANDALONE_SERVER_DIRECT="${WEB_DIR}/.next/standalone/server.js"

if [ -f "${STANDALONE_SERVER_NESTED}" ]; then
  STANDALONE_SERVER="${STANDALONE_SERVER_NESTED}"
  STANDALONE_ROOT="${WEB_DIR}/.next/standalone"
  SERVER_ENTRY="apps/web/server.js"
elif [ -f "${STANDALONE_SERVER_DIRECT}" ]; then
  STANDALONE_SERVER="${STANDALONE_SERVER_DIRECT}"
  STANDALONE_ROOT="${WEB_DIR}/.next/standalone"
  SERVER_ENTRY="server.js"
else
  STANDALONE_SERVER=""
fi

if [ -n "${STANDALONE_SERVER}" ]; then
  echo "✅ Standalone server found: ${STANDALONE_SERVER}"
  echo "Preparing standalone assets..."
  
  # Copy public to standalone root
  cp -r "${WEB_DIR}/public" "${STANDALONE_ROOT}/" || true
  
  # Copy static to standalone root's .next
  mkdir -p "${STANDALONE_ROOT}/.next"
  cp -r "${WEB_DIR}/.next/static" "${STANDALONE_ROOT}/.next/" || true

  # Also copy to nested apps/web/.next for safety using nested path structure if needed
  # (Standard Next.js standalone often benefits from this if paths are absolute)
  if [[ "${SERVER_ENTRY}" == "apps/web/server.js" ]]; then
     mkdir -p "${STANDALONE_ROOT}/apps/web/.next"
     cp -r "${WEB_DIR}/.next/static" "${STANDALONE_ROOT}/apps/web/.next/" || true
  fi

  echo "Starting standalone server from root: ${STANDALONE_ROOT}"
  cd "${STANDALONE_ROOT}"
  exec node "${SERVER_ENTRY}"
else
  echo "⚠️  Standalone server NOT found at ${STANDALONE_SERVER}."
  echo "⚠️  Falling back to standard 'next start'..."
  
  # Check for next binary definition
  NEXT_BIN="next"
  if [ -f "node_modules/.bin/next" ]; then
    NEXT_BIN="./node_modules/.bin/next"
  elif ! command -v next &> /dev/null; then
     echo "❌ Error: 'next' binary missing in PATH and node_modules."
     echo "Debug: Listing node_modules/.bin:"
     ls -la node_modules/.bin || echo "node_modules missing"
     exit 1
  fi

  echo "DEBUG: Starting fallback server using: ${NEXT_BIN}"
  exec "${NEXT_BIN}" start --port "${PORT}" --hostname "${HOSTNAME}"
fi
