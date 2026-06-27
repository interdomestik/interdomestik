#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPABASE_HEALTH_URL="${SUPABASE_HEALTH_URL:-http://127.0.0.1:54321/rest/v1/}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-54322}"
DOCKER_INFO_TIMEOUT="${DOCKER_INFO_TIMEOUT:-10}"

fail() {
  local step="$1"
  local detail="$2"
  echo "doctor: FAIL step=${step} detail=${detail}" >&2
  exit 1
}

pass() {
  echo "doctor: PASS docker=healthy supabase=healthy postgres=healthy"
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  "$@" &
  local pid="$!"
  local elapsed=0
  while kill -0 "${pid}" 2>/dev/null; do
    if (( elapsed >= timeout_seconds )); then
      kill -TERM "${pid}" 2>/dev/null || true
      sleep 1
      kill -KILL "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "${pid}"
}

docker_info() {
  docker info >/dev/null 2>&1
}

recover_docker_desktop() {
  command -v docker >/dev/null 2>&1 || fail docker "docker CLI is not installed"
  if run_with_timeout "${DOCKER_INFO_TIMEOUT}" docker_info; then
    return 0
  fi

  command -v docker >/dev/null 2>&1 || fail docker "docker CLI disappeared during recovery"
  docker desktop version >/dev/null 2>&1 ||
    fail docker "docker info unhealthy and Docker Desktop CLI is unavailable; start Docker manually"
  echo "doctor: docker info timed out; restarting Docker Desktop"
  docker desktop stop --force --timeout 45 >/dev/null 2>&1 || true
  docker desktop start --timeout 120 >/dev/null 2>&1 || fail docker "docker desktop start failed"
  run_with_timeout "${DOCKER_INFO_TIMEOUT}" docker_info || fail docker "docker info still unhealthy after restart"
}

start_supabase_if_needed() {
  if curl --fail --silent --output /dev/null "${SUPABASE_HEALTH_URL}" && tcp_ready; then
    return 0
  fi

  echo "doctor: starting local Supabase"
  if pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase start; then
    return 0
  fi

  echo "doctor: supabase start failed; clearing local Supabase port conflicts"
  cleanup_supabase_port_conflicts
  pnpm --dir "${ROOT_DIR}" --filter @interdomestik/database exec supabase start ||
    fail supabase "supabase start failed after clearing port conflicts"
}

tcp_ready() {
  (echo >"/dev/tcp/${POSTGRES_HOST}/${POSTGRES_PORT}") >/dev/null 2>&1
}

wait_for_http() {
  local attempt=1
  while (( attempt <= 60 )); do
    if curl --fail --silent --output /dev/null "${SUPABASE_HEALTH_URL}"; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  fail supabase "timed out waiting for ${SUPABASE_HEALTH_URL}"
}

wait_for_postgres() {
  local attempt=1
  while (( attempt <= 60 )); do
    if tcp_ready; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  fail postgres "timed out waiting for ${POSTGRES_HOST}:${POSTGRES_PORT}"
}

run_database_migrations() {
  if [[ "${DOCTOR_SKIP_DB_MIGRATE:-0}" == "1" ]]; then
    return 0
  fi

  echo "doctor: applying database migrations"
  node "${ROOT_DIR}/scripts/run-with-default-db-url.mjs" pnpm db:migrate >/dev/null ||
    fail migrations "db:migrate failed"
}

cleanup_supabase_port_conflicts() {
  local projects names
  projects="$(
    docker ps --format '{{.Names}} {{.Ports}}' |
      awk '/5432[0-9]/ && $1 ~ /^supabase_/ { sub(/^.*_/, "", $1); print $1 }' |
      sort -u
  )"
  if [[ -z "${projects}" ]]; then
    return 0
  fi

  names="$(
    for project in ${projects}; do
      docker ps -a --format '{{.Names}}' |
        awk -v suffix="_${project}" '$0 ~ /^supabase_/ && substr($0, length($0) - length(suffix) + 1) == suffix'
    done
  )"
  if [[ -z "${names}" ]]; then
    return 0
  fi

  echo "${names}" | xargs docker rm -f >/dev/null 2>&1 || true
}

recover_docker_desktop
start_supabase_if_needed
wait_for_http
wait_for_postgres
run_database_migrations
pass
