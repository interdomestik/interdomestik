#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${SKIP_NODE_GUARD:-}" == "1" ]]; then
  exit 0
fi

REQUIRED_MAJOR="20"
NODE_VERSION="$(node -v 2>/dev/null || true)"

if [[ -z "${NODE_VERSION}" ]]; then
  echo "❌ Node.js not found on PATH."
  exit 1
fi

MAJOR="${NODE_VERSION#v}"
MAJOR="${MAJOR%%.*}"

if [[ "${MAJOR}" != "${REQUIRED_MAJOR}" ]]; then
  cat <<EOF
❌ Unsupported Node.js version: ${NODE_VERSION}
✅ Expected: v${REQUIRED_MAJOR}.x (repo .nvmrc)

Fix (local):
  source ~/.nvm/nvm.sh
  nvm use ${REQUIRED_MAJOR}
  export PATH="\$NVM_BIN:\$PATH"

Or bypass once:
  SKIP_NODE_GUARD=1 <your-command>

EOF
  exit 1
fi
