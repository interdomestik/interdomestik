#!/usr/bin/env bash
set -euo pipefail

# Helper to run commands inside the Docker Playwright service.
# The service entrypoint is /bin/bash, so commands must be passed via -lc.

BUILD_MODE=0
if [[ "${1:-}" == "--build" ]]; then
  BUILD_MODE=1
  shift
fi

RAW_MODE=0
if [[ "${1:-}" == "--raw" ]]; then
  RAW_MODE=1
  shift
fi

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 [--build] [--raw] <command...>"
  echo "Use --build to rebuild the Playwright image before running."
  echo "Use --raw to pass a pre-composed shell command string."
  echo "Example: $0 pnpm --filter @interdomestik/web test:smoke"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/docker-env-bootstrap.sh
source "${SCRIPT_DIR}/docker-env-bootstrap.sh"
prepare_docker_env

if [[ "${RAW_MODE}" -eq 1 ]]; then
  command_string="$*"
else
  printf -v command_string '%q ' "$@"
  command_string="${command_string% }"
fi

echo "🐳 Running in Docker (playwright): ${command_string}"
docker_args=(compose run --rm --no-deps)
if [[ "${BUILD_MODE}" -eq 1 ]]; then
  docker_args+=(--build)
fi
docker_args+=(playwright -lc "${command_string}")

docker "${docker_args[@]}"
