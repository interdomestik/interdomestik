#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-quick}"

case "${MODE}" in
  quick|pr|full)
    ;;
  *)
    echo "Usage: scripts/ci-local-lowdisk.sh [quick|pr|full]" >&2
    exit 2
    ;;
esac

cleanup() {
  bash scripts/docker-reclaim-ci-local.sh
}

trap cleanup EXIT

bash scripts/ci-local-parity.sh "${MODE}"

