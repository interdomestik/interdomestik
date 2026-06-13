#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')}"
PROJECT_NAME="${PROJECT_NAME%-}"

CI_LOCAL_VOLUME_SUFFIXES=(
  ci_local_pnpm_store
  ci_local_root_node_modules
  ci_local_web_node_modules
  ci_local_playwright_cache
  ci_local_turbo_cache
  ci_local_sonar_cache
)

volume_matches_ci_local_cache() {
  local volume="$1"

  for suffix in "${CI_LOCAL_VOLUME_SUFFIXES[@]}"; do
    if [[ "${volume}" == *"${suffix}" ]]; then
      return 0
    fi
  done

  return 1
}

remove_ci_local_cache_volumes() {
  local had_any=0

  while IFS= read -r volume; do
    [[ -z "${volume}" ]] && continue
    if ! volume_matches_ci_local_cache "${volume}"; then
      continue
    fi

    had_any=1
    if [[ -n "$(docker ps -aq --filter "volume=${volume}")" ]]; then
      continue
    fi

    docker volume rm "${volume}" >/dev/null 2>&1 || true
  done < <(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}")

  if [[ "${had_any}" -eq 1 ]]; then
    echo "Removed unused CI-local cache volumes for project '${PROJECT_NAME}'."
  fi
}

echo "📦 Docker disk usage BEFORE (ci-local)"
docker system df || true

docker compose --profile ci-local rm -sf ci-postgres ci-parity >/dev/null 2>&1 || true
remove_ci_local_cache_volumes
docker container prune -f >/dev/null || true
docker image prune -f >/dev/null || true
docker buildx prune -f --filter "until=24h" >/dev/null 2>&1 || \
  docker builder prune -f --filter "until=24h" >/dev/null 2>&1 || true

echo "📦 Docker disk usage AFTER (ci-local)"
docker system df || true

