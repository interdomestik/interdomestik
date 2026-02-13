#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TS="$(date +"%Y%m%d-%H%M%S")"
OUT_DIR="${ROOT}/tmp/pilot-evidence/p2/${TS}"
mkdir -p "$OUT_DIR"/{logs,network}

APP_URL="${APP_URL:-https://interdomestik-web.vercel.app}"
CLAIM_ID="${CLAIM_ID:-pJa_mHrqdX_idSuJOtVcB}"

log() { printf "\n==> %s\n" "$1"; }
note() { printf "    %s\n" "$1"; }

run_and_capture() {
  local name="$1"; shift
  local file="${OUT_DIR}/logs/${name}.log"
  local exit_code=0
  log "RUN: ${name}"
  {
    echo "date: $(date -Is)"
    echo "cmd: $*"
    echo
    set +e
    "$@"
    exit_code=$?
    set -e
    echo
    echo "exit_code: ${exit_code}"
  } >"$file" 2>&1

  if [[ "$exit_code" -eq 0 ]]; then
    note "OK: ${name} (log: ${file})"
  else
    note "FAIL: ${name} (exit ${exit_code}, log: ${file})"
  fi

  return "$exit_code"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $1" >&2
    exit 1
  }
}

capture_headers() {
  local name="$1"; shift
  local url="$1"; shift
  local out="${OUT_DIR}/network/${name}.headers.txt"
  curl -sS -D - -o /dev/null "$url" >"$out" || true
  note "Saved: ${out}"
}

# --- Preconditions ---
require_cmd vercel
require_cmd curl

# --- Snapshot ---
{
  echo "timestamp: ${TS}"
  echo "repo_root: ${ROOT}"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "git_head: $(git rev-parse HEAD)"
  echo "app_url: ${APP_URL}"
  echo "claim_id: ${CLAIM_ID}"
  echo
  echo "git_status_porcelain:"
  git status --porcelain=v1
} >"${OUT_DIR}/logs/baseline.txt"

log "Manual Steps (Print-Only)"
cat >"${OUT_DIR}/logs/manual_steps.txt" <<MANUAL
P2 Manual Checklist (Production-like)

Accounts (DO NOT use tainted member.ks.a1@interdomestik.com):
- Gate member (clean pin): member.ks.a2@interdomestik.com
- Admin: admin.ks@...
- Staff: staff.ks@...
- Agent: agent.ks.a1@...
- Members created for P2 evidence: P2-A / P2-B / P2-C (see accounts.runtime.json in previous bundle)

P2.4 Document lifecycle (RUN FIRST)
- Member portal: ${APP_URL}/en/member/documents
  - Verify upload control appears for at least one claim card (requires an existing claim).
  - Upload a small PDF <= 200KB.
  - Refresh; confirm listed.
  - Logout/login; confirm listed.
  - Download; confirm headers show application/pdf and not HTML.
- Agent portal (IF upload UI exists): attempt upload for Member A claim.
- Staff portal (IF upload UI exists): attempt upload on staff claim detail.

P2.1 Claim creation + visibility
- As Member A: create claim (or use existing ${CLAIM_ID}); verify list+detail.
- As Agent1: verify claim visible for Member A.
- As Staff1: verify claim visible.
- As Admin: verify claim visible.

P2.2 Assignment
- As Admin (ops claim detail): assign claim to Staff1 (and Agent1 if model exists).
- Verify assignment reflected on dashboards and persists after refresh/relogin.

P2.3 Staff updates status/note
- As Staff1: assign to self if needed, update status + add member-visible note.
- As Member A: verify status + note visible.
- As Agent1: verify status is visible for their client.

P2.5 Role grant/revoke access flip
- Pick a non-critical test user.
- In Admin user profile roles panel:
  - Grant staff role => /en/staff routes become accessible.
  - Revoke staff role => /en/staff routes denied.
  - For branch-required roles (agent/branch_manager): ensure branch is required; verify access depends on role.
  - Tenant context guard: opening profile without tenantId shows "Missing tenant context"; with tenantId works.

Log Gate (after each P2 section)
- vercel logs --environment production --since 30m --no-branch --level error
MANUAL
note "Manual steps saved: ${OUT_DIR}/logs/manual_steps.txt"

log "Safe Probes"
run_and_capture "vercel_whoami" vercel whoami || true
run_and_capture "vercel_inspect_prod_alias" vercel inspect "${APP_URL}" || true
run_and_capture "vercel_logs_errors_30m" vercel logs --environment production --since 30m --no-branch --level error || true
run_and_capture "vercel_logs_errors_30m_json" vercel logs --environment production --since 30m --no-branch --level error --json || true

# Route contract probes (non-destructive)
run_and_capture "http_member_documents" curl -sS -o /dev/null -w "%{http_code}\n" "${APP_URL}/en/member/documents" || true
run_and_capture "http_member_claim_detail" curl -sS -o /dev/null -w "%{http_code}\n" "${APP_URL}/en/member/claims/${CLAIM_ID}" || true
run_and_capture "http_staff_claim_detail" curl -sS -o /dev/null -w "%{http_code}\n" "${APP_URL}/en/staff/claims/${CLAIM_ID}" || true
run_and_capture "http_admin_claim_detail" curl -sS -o /dev/null -w "%{http_code}\n" "${APP_URL}/en/admin/claims/${CLAIM_ID}" || true

# Webhook GET contract example (should not be 200)
# If path differs, adjust WEBHOOK_PATH.
WEBHOOK_PATH="${WEBHOOK_PATH:-/api/webhooks/supabase}"
run_and_capture "http_webhook_get" curl -sS -o /dev/null -w "%{http_code}\n" "${APP_URL}${WEBHOOK_PATH}" || true

# If you have a document download URL, paste it and capture headers (no auth token handled here).
# Example:
# capture_headers member_doc_download "${APP_URL}/api/documents/<docId>/download"

log "DONE"
echo "Evidence dir: ${OUT_DIR}"
