#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

ensure_docker_running() {
  if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Start Docker and retry."
    exit 1
  fi

  return 0
}

ensure_supabase_running() {
  if pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase status >/dev/null 2>&1; then
    return 0
  fi

  echo "⚠️  Supabase is not running. Starting local Supabase..."
  pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase start

  return 0
}

main() {
  cd "${ROOT_DIR}"

  echo "🚀 Quick Start Interdomestik System"
  echo "==================================="

  ensure_docker_running
  bash "${ROOT_DIR}/scripts/docker-dev-up.sh"
  ensure_supabase_running

  echo "▶️  Starting app on host with hot reload..."
  exec pnpm dev

  return 0
}

main "$@"
