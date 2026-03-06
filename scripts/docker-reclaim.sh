#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-light}"
FLAG="${2:-}"
FORCE="${DOCKER_RECLAIM_FORCE:-0}"

if [[ "$MODE" != "light" && "$MODE" != "gate" && "$MODE" != "sonar" && "$MODE" != "full" ]]; then
  echo "Usage: $0 [light|gate|sonar|full] [--yes]"
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')}"
PROJECT_NAME="${PROJECT_NAME%-}"

print_df() {
  echo ""
  docker system df || true
  echo ""
}

compose_down_all() {
  docker compose --profile infra --profile gate --profile db --profile sonar down --remove-orphans >/dev/null 2>&1 || true
}

compose_down_gate() {
  docker compose --profile gate down --remove-orphans >/dev/null 2>&1 || true
}

compose_down_sonar() {
  docker compose --profile sonar down -v --remove-orphans >/dev/null 2>&1 || true
}

remove_project_volumes() {
  local had_any=0
  while IFS= read -r volume; do
    [[ -z "$volume" ]] && continue
    had_any=1
    if docker ps -aq --filter "volume=${volume}" | grep -q .; then
      continue
    fi
    docker volume rm "$volume" >/dev/null 2>&1 || true
  done < <(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}")

  if [[ "$had_any" -eq 1 ]]; then
    echo "Removed unused compose volumes for project '${PROJECT_NAME}'."
  fi
}

remove_sonar_volumes() {
  while IFS= read -r volume; do
    [[ -z "$volume" ]] && continue
    if docker ps -aq --filter "volume=${volume}" | grep -q .; then
      continue
    fi
    docker volume rm "$volume" >/dev/null 2>&1 || true
  done < <(docker volume ls -q | grep -E 'sonar' || true)
}

prune_builder_light() {
  docker buildx prune -f --filter 'until=24h' >/dev/null 2>&1 || \
    docker builder prune -f --filter 'until=24h' >/dev/null 2>&1 || true
}

prune_builder_full() {
  docker buildx prune -af >/dev/null 2>&1 || docker builder prune -af >/dev/null 2>&1 || true
}

if [[ "$MODE" == "full" && "$FLAG" != "--yes" && "$FORCE" != "1" ]]; then
  echo "⚠️  Full reclaim will remove ALL unused images, volumes, containers, and build cache."
  read -r -p "Continue? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "📦 Docker disk usage BEFORE (${MODE})"
print_df

case "$MODE" in
  light)
    docker container prune -f >/dev/null || true
    docker image prune -f >/dev/null || true
    prune_builder_light
    ;;
  gate)
    compose_down_gate
    docker container prune -f >/dev/null || true
    docker image prune -f >/dev/null || true
    prune_builder_light
    ;;
  sonar)
    compose_down_sonar
    remove_project_volumes
    remove_sonar_volumes
    docker image prune -f >/dev/null || true
    prune_builder_light
    ;;
  full)
    compose_down_all
    docker container prune -f >/dev/null || true
    docker image prune -af >/dev/null || true
    prune_builder_full
    docker volume prune -f >/dev/null || true
    docker network prune -f >/dev/null || true
    ;;
esac

echo "📦 Docker disk usage AFTER (${MODE})"
print_df
