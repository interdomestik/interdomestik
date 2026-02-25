#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEEK_STAMP="$(date -u +%G-W%V)"
RUN_ID_RAW="weekly-${WEEK_STAMP}-$(date -u +%H%M%S)"
RUN_ID="$(echo "${RUN_ID_RAW}" | tr '[:upper:]' '[:lower:]')"

OUT_DIR="${ROOT_DIR}/tmp/multi-agent/benchmarks/weekly"
SUITE_PATH="${ROOT_DIR}/scripts/multi-agent/benchmark-suite.internal.json"

echo "[weekly-benchmark] suite=${SUITE_PATH}"
echo "[weekly-benchmark] out_dir=${OUT_DIR}"
echo "[weekly-benchmark] run_id=${RUN_ID}"

node "${ROOT_DIR}/scripts/multi-agent/benchmark-lane.mjs" \
  --suite "${SUITE_PATH}" \
  --out-dir "${OUT_DIR}" \
  --run-id "${RUN_ID}"

echo "[weekly-benchmark] PASS"
echo "[weekly-benchmark] scorecard=${OUT_DIR}/${RUN_ID}/scorecard.json"
