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

echo "E2E webserver env:"
echo "  BASE_URL=${BASE_URL}"
echo "  NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
echo "  BETTER_AUTH_URL=${BETTER_AUTH_URL}"
echo "  BETTER_AUTH_TRUSTED_ORIGINS=${BETTER_AUTH_TRUSTED_ORIGINS}"
echo "  HOSTNAME=${HOSTNAME}"
echo "  PORT=${PORT}"

# Assume build --filter @interdomestik/web already happened.
# standalone output requires copying static/public into the standalone folder or 
# referencing them correctly. Next.js standalone by default expects them in the
# subfolder apps/web/.next/... or at the root of the standalone dist.
# In our monorepo/standalone structure, we just run the server.js.

STANDALONE_SERVER="${WEB_DIR}/.next/standalone/apps/web/server.js"

# Fast-fail if standalone build is missing (turns confusing E2E failure into immediate build artifact error)
if [ ! -f "${STANDALONE_SERVER}" ]; then
  echo "❌ Error: Next.js standalone server not found at ${STANDALONE_SERVER}."
  echo "Ensure the build ran with 'output: standalone' in next.config.mjs."
  echo ""
  echo "Expected structure:"
  echo "  ${WEB_DIR}/.next/standalone/apps/web/server.js"
  exit 1
fi

echo "✅ Standalone server found: ${STANDALONE_SERVER}"

# Next.js standalone requires static and public files to be copied manually
# to the standalone destination if they are to be served by the node server.
# Correct mapping for monorepos:
# standalone/public
# standalone/.next/static

STANDALONE_ROOT="${WEB_DIR}/.next/standalone"

echo "Preparing standalone assets..."
# Copy public to standalone root
cp -r "${WEB_DIR}/public" "${STANDALONE_ROOT}/" || true
# Copy static to standalone root's .next
mkdir -p "${STANDALONE_ROOT}/.next"
cp -r "${WEB_DIR}/.next/static" "${STANDALONE_ROOT}/.next/" || true

echo "Starting standalone server from root: ${STANDALONE_ROOT}"
cd "${STANDALONE_ROOT}"
node apps/web/server.js
