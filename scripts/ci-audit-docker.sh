#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_TAG="interdomestikv2-ci-audit:node20-pnpm10.28.2"
STORE_DIR="${ROOT_DIR}/.tmp/pnpm-store"

mkdir -p "${STORE_DIR}"

echo "🏗️  Building CI-audit image: ${IMAGE_TAG}"
docker build -f "${ROOT_DIR}/docker/Dockerfile.ci-audit" -t "${IMAGE_TAG}" "${ROOT_DIR}" >/dev/null

echo "🚀 Running pnpm install + audit gate in Linux container"

MASK_NODE_MODULES=(
  -v /repo/node_modules
)

# Hide host node_modules for each workspace package to avoid cross-platform pnpm prompts.
for rel in apps/* packages/*; do
  if [[ -d "${ROOT_DIR}/${rel}" ]]; then
    MASK_NODE_MODULES+=( -v "/repo/${rel}/node_modules" )
  fi
done

docker run --rm -t \
  -e CI=1 \
  -e HUSKY=0 \
  -e PNPM_STORE_DIR=/pnpm-store \
  -v "${ROOT_DIR}":/repo \
  -v "${STORE_DIR}":/pnpm-store \
  "${MASK_NODE_MODULES[@]}" \
  -w /repo \
  "${IMAGE_TAG}"
