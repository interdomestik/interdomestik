#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${SKIP_NODE_GUARD:-}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NVMRC_PATH="${REPO_ROOT}/.nvmrc"
REQUIRED_VERSION="$(tr -d '[:space:]' < "${NVMRC_PATH}" 2>/dev/null || true)"

if [[ -z "${REQUIRED_VERSION}" ]]; then
  echo "❌ Unable to read required Node.js version from ${NVMRC_PATH}."
  exit 1
fi

REQUIRED_MAJOR="${REQUIRED_VERSION#v}"
REQUIRED_MAJOR="${REQUIRED_MAJOR%%.*}"
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
  direnv allow
  direnv reload

Or with nvm:
  source ~/.nvm/nvm.sh
  nvm use ${REQUIRED_VERSION}
  export PATH="\$NVM_BIN:\$PATH"

Or bypass once:
  SKIP_NODE_GUARD=1 <your-command>

EOF
  exit 1
fi
