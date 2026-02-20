#!/usr/bin/env bash
set -euo pipefail

: "${SONAR_TOKEN:?Set SONAR_TOKEN (Sonar token for API access)}"
: "${SONAR_HOST_URL:?Set SONAR_HOST_URL (e.g. http://127.0.0.1:9000)}"
: "${SONAR_PROJECT_KEY:?Set SONAR_PROJECT_KEY}"

RUN_ID="${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}"
EVIDENCE_DIR="${EVIDENCE_DIR:-evidence/$RUN_ID}"
SCAN_LOG="$EVIDENCE_DIR/logs/sonar-scan.log"
GATE_JSON="$EVIDENCE_DIR/logs/sonar-qualitygate.json"
SUMMARY="$EVIDENCE_DIR/notes/sonar-summary.md"

mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/notes"

export SONAR_SCANNER_CMD="${SONAR_SCANNER_CMD:-pnpm sonar:scan}"

echo "Running Sonar scan via: $SONAR_SCANNER_CMD"
bash -lc "$SONAR_SCANNER_CMD" 2>&1 | tee "$SCAN_LOG"

TASK_ID="$(
  grep -Eo 'api/ce/task\\?id=[^ ]+' "$SCAN_LOG" \
    | tail -n 1 \
    | sed -E 's#.*id=([^& ]+).*#\1#'
)"

if [[ -z "${TASK_ID}" || "${TASK_ID}" == "null" ]]; then
  echo "Failed to read ceTaskId from Sonar scanner output." >&2
  echo "Check scan log: $SCAN_LOG" >&2
  exit 1
fi

export SONAR_CE_TASK_ID="$TASK_ID"

poll_with_timeout() {
  local url="$1"
  local status=""
  local attempts=0
  local max_attempts=60

  while true; do
    attempts=$((attempts + 1))
    local response
    response="$(curl -sS -u "${SONAR_TOKEN}:" "$url" || true)"

    status="$(node - <<'NODE'
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
if (!input.trim()) process.exit(1);
const data = JSON.parse(input);
process.stdout.write(String(data.task?.status || ''));
NODE <<< "$response")"

    if [[ "$status" == "SUCCESS" ]]; then
      break
    fi

    if [[ "$status" == "FAILED" || "$status" == "CANCELED" ]]; then
      echo "Sonar compute task failed (status: $status)." >&2
      echo "$response" > "$GATE_JSON"
      exit 1
    fi

    if (( attempts >= max_attempts )); then
      echo "Timed out waiting for Sonar compute task (task=$TASK_ID)." >&2
      exit 1
    fi

    echo "Sonar compute status: ${status:-UNKNOWN} (attempt ${attempts}/${max_attempts})"
    sleep 5
  done

  local analysis_id
  analysis_id="$(node - <<'NODE'
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
if (!input.trim()) process.exit(1);
const data = JSON.parse(input);
process.stdout.write(String(data.task?.analysisId || ''));
NODE <<< "$response")"
  echo "$analysis_id"
}

ce_status_url="$SONAR_HOST_URL/api/ce/task?id=$TASK_ID"
export SONAR_ANALYSIS_ID="$(poll_with_timeout "$ce_status_url")"

if [[ -z "${SONAR_ANALYSIS_ID}" || "${SONAR_ANALYSIS_ID}" == "null" ]]; then
  echo "Could not resolve analysisId for task $TASK_ID." >&2
  exit 1
fi

quality_gate_url="$SONAR_HOST_URL/api/qualitygates/project_status?analysisId=$SONAR_ANALYSIS_ID"
curl -sS -u "${SONAR_TOKEN}:" "$quality_gate_url" > "$GATE_JSON"

GATE_STATUS="$(node - <<'NODE' "$GATE_JSON"
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(String(data?.projectStatus?.status || 'UNKNOWN'));
NODE)"

cat > "$SUMMARY" <<EOF
# Sonar Quality Gate Summary

- Project key: ${SONAR_PROJECT_KEY}
- Analysis ID: ${SONAR_ANALYSIS_ID}
- Compute task: ${SONAR_CE_TASK_ID}
- Gate status: ${GATE_STATUS}

## Non-OK quality gate conditions

EOF

node - <<'NODE' "$GATE_JSON" >> "$SUMMARY"
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const conditions = Array.isArray(data.projectStatus?.conditions) ? data.projectStatus.conditions : [];
const rows = conditions
  .filter(condition => condition.status !== 'OK')
  .map(condition => `- ${condition.metricKey}: ${condition.status} (actual=${condition.actual}, threshold=${condition.errorThreshold})`);
if (rows.length === 0) {
  process.stdout.write('- No non-OK conditions\n');
  process.exit(0);
}
process.stdout.write(rows.join('\n') + '\n');
NODE

echo "Sonar quality gate status: $GATE_STATUS"
echo "Quality gate JSON: $GATE_JSON"
echo "Summary note: $SUMMARY"

if [[ "$GATE_STATUS" != "OK" ]]; then
  echo "Sonar quality gate failed. See $SUMMARY for details." >&2
  exit 1
fi

echo "Sonar quality gate passed."
