#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-light}"
FLAG="${2:-}"
FORCE="${DOCKER_RECLAIM_FORCE:-0}"
DOCKER_GATE_CACHE_MODE="${DOCKER_GATE_CACHE_MODE:-ephemeral}"
DOCKER_RECLAIM_SOFT_LIMIT_GB="${DOCKER_RECLAIM_SOFT_LIMIT_GB:-20}"

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

  return 0
}

validate_gate_cache_mode() {
  case "${DOCKER_GATE_CACHE_MODE}" in
    ephemeral|warm)
      return 0
      ;;
    *)
      echo "ERROR: DOCKER_GATE_CACHE_MODE must be 'ephemeral' or 'warm'." >&2
      return 1
      ;;
  esac
}

docker_storage_bytes() {
  docker system df --format '{{json .}}' | node -e '
    const unitMap = new Map([
      ["B", 1],
      ["kB", 1024],
      ["MB", 1024 ** 2],
      ["GB", 1024 ** 3],
      ["TB", 1024 ** 4],
      ["PB", 1024 ** 5],
    ]);

    const parseSize = input => {
      const match = String(input ?? "").trim().match(/^([0-9]+(?:\\.[0-9]+)?)\\s*([A-Za-z]+)$/);
      if (!match) {
        return 0;
      }

      const value = Number(match[1]);
      const unit = match[2];
      return Math.round(value * (unitMap.get(unit) ?? 0));
    };

    let total = 0;
    process.stdin.on("data", chunk => {
      for (const line of chunk.toString().split(/\\r?\\n/)) {
        if (!line.trim()) continue;
        total += parseSize(JSON.parse(line).Size);
      }
    });
    process.stdin.on("end", () => process.stdout.write(String(total)));
  '
}

warn_if_over_budget() {
  local budget_gb="${DOCKER_RECLAIM_SOFT_LIMIT_GB}"

  if [[ "${budget_gb}" == "0" ]]; then
    return 0
  fi

  if [[ ! "${budget_gb}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "ERROR: DOCKER_RECLAIM_SOFT_LIMIT_GB must be numeric." >&2
    return 1
  fi

  local total_bytes
  total_bytes="$(docker_storage_bytes)"

  local budget_bytes
  budget_bytes="$(node -e 'process.stdout.write(String(Math.round(Number(process.argv[1]) * 1024 ** 3)))' "${budget_gb}")"

  if (( total_bytes > budget_bytes )); then
    local total_gb
    total_gb="$(node -e 'process.stdout.write((Number(process.argv[1]) / 1024 ** 3).toFixed(2))' "${total_bytes}")"
    echo "⚠️  Docker storage remains above the soft budget (${total_gb}GB > ${budget_gb}GB)."
    echo "    Run 'pnpm docker:reclaim:full' if you want an aggressive cleanup."
  fi

  return 0
}

compose_down_all() {
  docker compose --profile infra --profile gate --profile db --profile sonar down --remove-orphans >/dev/null 2>&1 || true

  return 0
}

compose_down_gate() {
  docker compose --profile gate down --remove-orphans >/dev/null 2>&1 || true

  return 0
}

compose_down_sonar() {
  docker compose --profile sonar down -v --remove-orphans >/dev/null 2>&1 || true

  return 0
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

  return 0
}

remove_sonar_volumes() {
  while IFS= read -r volume; do
    [[ -z "$volume" ]] && continue
    if docker ps -aq --filter "volume=${volume}" | grep -q .; then
      continue
    fi
    docker volume rm "$volume" >/dev/null 2>&1 || true
  done < <(docker volume ls -q | grep -E 'sonar' || true)

  return 0
}

remove_gate_cache_volumes() {
  local had_any=0

  validate_gate_cache_mode

  while IFS= read -r volume; do
    [[ -z "$volume" ]] && continue
    case "$volume" in
      *playwright_pnpm_store|*playwright_root_node_modules|*playwright_web_node_modules)
        had_any=1
        if [[ "${DOCKER_GATE_CACHE_MODE}" == "warm" && "$volume" == *playwright_pnpm_store ]]; then
          continue
        fi
        if docker ps -aq --filter "volume=${volume}" | grep -q .; then
          continue
        fi
        docker volume rm "$volume" >/dev/null 2>&1 || true
        ;;
      *)
        ;;
    esac
  done < <(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}")

  if [[ "$had_any" -eq 1 ]]; then
    echo "Removed unused gate cache volumes for project '${PROJECT_NAME}'."
  fi

  return 0
}

prune_builder_light() {
  docker buildx prune -f --filter "until=24h" >/dev/null 2>&1 || \
    docker builder prune -f --filter "until=24h" >/dev/null 2>&1 || true

  return 0
}

prune_builder_gate() {
  docker buildx prune -f >/dev/null 2>&1 || \
    docker builder prune -f >/dev/null 2>&1 || true

  return 0
}

prune_builder_full() {
  docker buildx prune -af >/dev/null 2>&1 || docker builder prune -af >/dev/null 2>&1 || true

  return 0
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
    remove_gate_cache_volumes
    docker container prune -f >/dev/null || true
    docker image prune -f >/dev/null || true
    prune_builder_gate
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
  *)
    echo "Usage: $0 [light|gate|sonar|full] [--yes]" >&2
    exit 2
    ;;
esac

echo "📦 Docker disk usage AFTER (${MODE})"
print_df
warn_if_over_budget
