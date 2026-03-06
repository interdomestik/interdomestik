#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

ensure_docker_running() {
  if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Start Docker and retry."
    exit 1
  fi
}

ensure_supabase_running() {
  if pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase status >/dev/null 2>&1; then
    return 0
  fi

  echo "⚠️  Supabase is not running. Starting local Supabase..."
  pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase start
}

main() {
  cd "${ROOT_DIR}"

  echo "🚀 Starting Interdomestik System (verified parity mode)"
  ensure_docker_running
  ensure_supabase_running

  DOCKER_GATE_KEEP_RUNNING=1 DOCKER_GATE_RECLAIM=0 DOCKER_GATE_REBUILD="${DOCKER_GATE_REBUILD:-0}" \
    bash "${ROOT_DIR}/scripts/docker-gate.sh"

  cat <<'EOF'
System ready:
  - Web App:  http://localhost:3000
  - Mailpit:  http://localhost:8025
  - MinIO:    http://localhost:9001
  - Supabase: http://localhost:54323

To stop parity services:
  docker compose --profile gate down --remove-orphans
EOF
}

main "$@"
