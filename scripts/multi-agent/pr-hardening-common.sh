#!/usr/bin/env bash
set -euo pipefail

iso_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

random_suffix() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 3
    return 0
  fi

  node -e 'process.stdout.write(require("node:crypto").randomBytes(3).toString("hex"))'
}

is_ci_environment() {
  case "${CI:-}" in
    1|true|TRUE|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

assert_node_bypass_policy() {
  local caller="$1"
  local allow_node_bypass="${2:-0}"

  if ! is_ci_environment; then
    return 0
  fi

  if [[ "$allow_node_bypass" -eq 1 || "${SKIP_NODE_GUARD:-}" == "1" ]]; then
    printf '[%s] FAIL: node guard bypass is forbidden in CI (remove --allow-node-bypass / SKIP_NODE_GUARD)\n' "$caller" >&2
    exit 1
  fi
}

require_run_root() {
  local run_root="$1"
  if [[ -z "$run_root" ]]; then
    printf '[pr-hardening-common] FAIL: --run-root is required\n' >&2
    exit 1
  fi

  if [[ ! -d "$run_root" ]]; then
    printf '[pr-hardening-common] FAIL: run root not found: %s\n' "$run_root" >&2
    exit 1
  fi
}

redact_stream() {
  # Redact obvious secrets/session tokens before writing logs to artifacts.
  sed -E \
    -e 's/(better-auth\.session_token[[:space:]]*[:=][[:space:]]*)[^",[:space:]]+/\1<REDACTED>/g' \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[A-Za-z0-9._-]+/\1<REDACTED>/g' \
    -e 's/([Ss]et-[Cc]ookie:[[:space:]]*[^=]+=)[^;[:space:]]+/\1<REDACTED>/g' \
    -e 's/([Cc]ookie:[[:space:]]*[^=]+=)[^;[:space:]]+/\1<REDACTED>/g' \
    -e 's/((access|refresh|session|id)_token[[:space:]]*[:=][[:space:]]*)[^",[:space:]]+/\1<REDACTED>/g' \
    -e 's/("value":[[:space:]]*")[^"]+/\1<REDACTED>/g' \
    -e 's/(sk_live_)[A-Za-z0-9]+/\1<REDACTED>/g' \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1<REDACTED>/g'
}

run_redacted() {
  local log_file="$1"
  shift

  mkdir -p "$(dirname "$log_file")"

  set +e
  (
    set -o pipefail
    "$@" 2>&1 | redact_stream | tee "$log_file"
  )
  local cmd_status=$?
  set -e
  return "$cmd_status"
}

emit_trace_event() {
  local run_root="$1"
  local run_id="$2"
  local role="$3"
  local phase="$4"
  local status="$5"
  local latency_ms="${6:-0}"
  local details="${7:-}"

  if [[ -z "$run_root" ]]; then
    return 0
  fi

  local trace_file="$run_root/trace.ndjson"
  mkdir -p "$run_root"

  node -e '
const fs = require("node:fs");
const latency = Number(process.argv[7] || "0");
const event = {
  ts: process.argv[2],
  run_id: process.argv[3],
  role: process.argv[4],
  phase: process.argv[5],
  status: process.argv[6],
  latency_ms: Number.isFinite(latency) ? latency : 0
};
if (process.argv[8]) event.details = process.argv[8];
const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
if (!isNonEmptyString(event.ts)) process.exit(2);
if (!isNonEmptyString(event.run_id)) process.exit(2);
if (!isNonEmptyString(event.role)) process.exit(2);
if (!isNonEmptyString(event.phase)) process.exit(2);
if (!(typeof event.status === "string" || typeof event.status === "number")) process.exit(2);
if (!Number.isFinite(event.latency_ms) || event.latency_ms < 0) process.exit(2);
fs.appendFileSync(process.argv[1], `${JSON.stringify(event)}\n`);
' "$trace_file" "$(iso_utc)" "$run_id" "$role" "$phase" "$status" "$latency_ms" "$details"
}

validate_trace_ndjson_file() {
  local trace_file="$1"
  if [[ ! -f "$trace_file" ]]; then
    printf '[pr-hardening-common] FAIL: trace file missing: %s\n' "$trace_file" >&2
    return 1
  fi

  node -e '
const fs = require("node:fs");
const traceFile = process.argv[1];
const lines = fs.readFileSync(traceFile, "utf8")
  .split("\n")
  .map(line => line.trim())
  .filter(Boolean);

const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;

for (let i = 0; i < lines.length; i += 1) {
  let event;
  try {
    event = JSON.parse(lines[i]);
  } catch {
    console.error(`[trace-lint] invalid JSON on line ${i + 1}`);
    process.exit(2);
  }

  if (!isNonEmptyString(event.ts)) process.exit(2);
  if (!isNonEmptyString(event.run_id)) process.exit(2);
  if (!isNonEmptyString(event.role)) process.exit(2);
  if (!isNonEmptyString(event.phase)) process.exit(2);
  if (!(typeof event.status === "string" || typeof event.status === "number")) process.exit(2);
  if (!Number.isFinite(event.latency_ms) || event.latency_ms < 0) process.exit(2);
}
' "$trace_file"
}

validate_status_json_file() {
  local status_json="$1"
  if [[ ! -f "$status_json" ]]; then
    printf '[pr-hardening-common] FAIL: status json missing: %s\n' "$status_json" >&2
    return 1
  fi

  node -e '
const fs = require("node:fs");
const path = process.argv[1];
let data;
try {
  data = JSON.parse(fs.readFileSync(path, "utf8"));
} catch {
  console.error(`[status-lint] invalid JSON: ${path}`);
  process.exit(2);
}

const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
if (!isNonEmptyString(data.role)) process.exit(2);
if (!(data.status === "PASS" || data.status === "FAIL")) process.exit(2);
if (!isNonEmptyString(data.timestampUtc)) process.exit(2);
if (typeof data.firstFailingCommand !== "string") process.exit(2);
if (typeof data.details !== "string") process.exit(2);
' "$status_json"
}

write_role_status() {
  local role="$1"
  local run_root="$2"
  local status="$3"
  local first_failing_command="$4"
  local details="${5:-}"

  local role_dir="$run_root/evidence/$role"
  mkdir -p "$role_dir"

  printf '%s\n' "$status" >"$role_dir/${role}.status"

  node -e '
const fs = require("node:fs");
const out = {
  role: process.argv[2],
  status: process.argv[3],
  timestampUtc: new Date().toISOString(),
  firstFailingCommand: process.argv[4] || "none",
  details: process.argv[5] || ""
};
fs.writeFileSync(process.argv[1], JSON.stringify(out, null, 2));
' "$role_dir/${role}.status.json" "$role" "$status" "$first_failing_command" "$details"

  validate_status_json_file "$role_dir/${role}.status.json"
}

read_manifest_value() {
  local run_root="$1"
  local key="$2"
  local manifest="$run_root/run-manifest.md"
  if [[ ! -f "$manifest" ]]; then
    printf ''
    return 0
  fi

  local line
  line="$(rg --no-line-number "^- ${key}: " "$manifest" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf ''
    return 0
  fi

  line="${line#- ${key}: }"
  line="${line#\`}"
  line="${line%\`}"
  printf '%s' "$line"
}
