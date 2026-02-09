#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TS="$(date +"%Y-%m-%dT%H-%M-%S%z")"
OUT_DIR="${ROOT}/tmp/pilot-evidence/paddle-prod-e2e/${TS}"
mkdir -p "$OUT_DIR"

APP_URL="${APP_URL:-https://interdomestik-web.vercel.app}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/api/webhooks/paddle}"
WEBHOOK_URL="${APP_URL%/}${WEBHOOK_PATH}"
PRICING_PATH="${PRICING_PATH:-/sq/pricing}"
PRICING_URL="${APP_URL%/}${PRICING_PATH}"

NON_INTERACTIVE="${NON_INTERACTIVE:-0}"

REQUIRED_PUBLIC_ENV_VARS=(
  "NEXT_PUBLIC_PADDLE_ENV"
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"
  "NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEAR"
  "NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR"
  "NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR"
  "NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTH"
  "NEXT_PUBLIC_PADDLE_PRICE_STANDARD_MONTH"
  "NEXT_PUBLIC_PADDLE_PRICE_FAMILY_MONTH"
  "NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR"
  "NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_MONTH"
)

REQUIRED_SERVER_ENV_VARS=(
  "PADDLE_API_KEY"
  "PADDLE_WEBHOOK_SECRET_KEY"
)

step() {
  printf "\n==> %s\n" "$1"
}

note() {
  printf "    %s\n" "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: '$1' is required but not installed." >&2
    exit 1
  }
}

capture_http() {
  local name="$1"
  shift
  local out_file="${OUT_DIR}/${name}.txt"
  local code_file="${OUT_DIR}/${name}.http_code"
  local code
  code="$(curl -sS -o "$out_file" -w "%{http_code}" "$@" || true)"
  echo "$code" >"$code_file"
  printf "%s\n" "$code"
}

pause_for_operator() {
  local prompt="$1"
  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    note "NON_INTERACTIVE=1 set; skipping prompt: ${prompt}"
    return 0
  fi
  read -r -p "${prompt} " _
}

check_vercel_env_name_presence() {
  local env_output="${OUT_DIR}/vercel-env-production.txt"
  vercel env ls production >"$env_output"
  note "Saved: $env_output"

  local missing=0
  {
    echo "Public vars:"
    for var_name in "${REQUIRED_PUBLIC_ENV_VARS[@]}"; do
      if grep -q "${var_name}" "$env_output"; then
        echo "  [OK] ${var_name}"
      else
        echo "  [MISSING] ${var_name}"
        missing=1
      fi
    done
    echo
    echo "Server vars:"
    for var_name in "${REQUIRED_SERVER_ENV_VARS[@]}"; do
      if grep -q "${var_name}" "$env_output"; then
        echo "  [OK] ${var_name}"
      else
        echo "  [MISSING] ${var_name}"
        missing=1
      fi
    done
  } | tee "${OUT_DIR}/vercel-env-presence-check.txt"

  if [[ "$missing" -eq 1 ]]; then
    note "Some required env var names are missing in Vercel production."
    note "Use the command templates in ${OUT_DIR}/vercel-env-add-templates.sh."
  fi
}

write_templates() {
  cat >"${OUT_DIR}/vercel-env-add-templates.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Fill values locally before running. Never commit secrets.
# Example:
# export NEXT_PUBLIC_PADDLE_ENV_VALUE="sandbox"
# printf "%s" "$NEXT_PUBLIC_PADDLE_ENV_VALUE" | vercel env add NEXT_PUBLIC_PADDLE_ENV production

printf "%s" "<NEXT_PUBLIC_PADDLE_ENV>" | vercel env add NEXT_PUBLIC_PADDLE_ENV production
printf "%s" "<NEXT_PUBLIC_PADDLE_CLIENT_TOKEN>" | vercel env add NEXT_PUBLIC_PADDLE_CLIENT_TOKEN production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEAR>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEAR production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTH>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTH production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_STANDARD_MONTH>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_STANDARD_MONTH production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_FAMILY_MONTH>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_FAMILY_MONTH production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR production
printf "%s" "<NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_MONTH>" | vercel env add NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_MONTH production
printf "%s" "<PADDLE_API_KEY>" | vercel env add PADDLE_API_KEY production
printf "%s" "<PADDLE_WEBHOOK_SECRET_KEY>" | vercel env add PADDLE_WEBHOOK_SECRET_KEY production
EOF
  chmod +x "${OUT_DIR}/vercel-env-add-templates.sh"

  cat >"${OUT_DIR}/vercel-redeploy-template.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
vercel --prod --yes
EOF
  chmod +x "${OUT_DIR}/vercel-redeploy-template.sh"

  cat >"${OUT_DIR}/supabase-verification.sql" <<'EOF'
-- Replace <EMAIL> if needed. Default target for pilot:
-- admin@interdomestik.com

select id, email, role, member_status, created_at, updated_at
from "user"
where lower(email) = lower('admin@interdomestik.com')
limit 1;

select id, provider, event_id, event_type, signature_valid, processing_result, received_at, processed_at
from webhook_events
where provider = 'paddle'
order by received_at desc
limit 20;

select id, user_id, plan_id, status, provider_customer_id, provider_subscription_id, updated_at
from subscriptions
order by updated_at desc
limit 20;

-- Idempotency check: event_id should not duplicate.
select event_id, count(*) as cnt
from webhook_events
where provider = 'paddle'
group by event_id
having count(*) > 1
order by cnt desc, event_id
limit 20;
EOF

  cat >"${OUT_DIR}/pilot-evidence-template.md" <<EOF
### Paddle Sandbox Full-Cycle - Production Evidence
- Date:
- Operator:
- App URL: ${APP_URL}
- Pricing URL used: ${PRICING_URL}
- Locale tested (ks/mk/pilot):

#### Checkpoint Results
1. Checkout initiation from pricing: PASS/FAIL
2. Webhook delivered to ${WEBHOOK_PATH}: PASS/FAIL
3. Signature verified: PASS/FAIL
4. DB updated (webhook + subscription/membership): PASS/FAIL
5. Redirect behavior per locale: PASS/FAIL

#### Checkout Details
- Paddle checkout/transaction id:
- Success URL observed:
- Cancel URL observed:

#### Webhook Evidence
- Paddle event id:
- Paddle delivery timestamp:
- Endpoint HTTP status:
- Vercel log snippet reference:

#### DB Evidence
- user row before:
- user row after:
- webhook_events row:
- subscriptions/membership row:
- idempotency query result:

#### Notes / Fixes Required
- None / list exact issue(s)
EOF
}

main() {
  step "Paddle Production E2E Checklist (safe, no secrets printed)"
  note "Output directory: ${OUT_DIR}"
  note "APP_URL: ${APP_URL}"
  note "WEBHOOK_URL: ${WEBHOOK_URL}"

  require_cmd git
  require_cmd curl
  require_cmd vercel

  step "Baseline snapshot"
  {
    echo "timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "repo_root: ${ROOT}"
    echo "git_head: $(git rev-parse HEAD)"
    echo "branch: $(git rev-parse --abbrev-ref HEAD)"
    echo "git_status_porcelain:"
    git status --porcelain
    echo
    echo "node: $(node -v 2>/dev/null || echo n/a)"
    echo "pnpm: $(pnpm -v 2>/dev/null || echo n/a)"
    echo "vercel_user:"
    vercel whoami || true
  } >"${OUT_DIR}/baseline.txt"
  note "Saved: ${OUT_DIR}/baseline.txt"

  step "Write operator templates (env commands, redeploy, SQL, report)"
  write_templates
  note "Saved: ${OUT_DIR}/vercel-env-add-templates.sh"
  note "Saved: ${OUT_DIR}/vercel-redeploy-template.sh"
  note "Saved: ${OUT_DIR}/supabase-verification.sql"
  note "Saved: ${OUT_DIR}/pilot-evidence-template.md"

  step "Check required Vercel production env var names (presence only)"
  check_vercel_env_name_presence

  step "Webhook endpoint safety probes"
  local get_code missing_sig_code bad_sig_code
  get_code="$(capture_http "probe-get-webhook" -X GET "$WEBHOOK_URL")"
  missing_sig_code="$(capture_http "probe-post-webhook-no-signature" -X POST "$WEBHOOK_URL" -H 'Content-Type: application/json' -d '{}')"
  bad_sig_code="$(capture_http "probe-post-webhook-invalid-signature" -X POST "$WEBHOOK_URL" -H 'Content-Type: application/json' -H 'Paddle-Signature: ts=1;v1=invalid' -d '{}')"

  {
    echo "GET ${WEBHOOK_URL} -> ${get_code} (expected 405)"
    echo "POST unsigned -> ${missing_sig_code} (expected 400)"
    echo "POST invalid signature -> ${bad_sig_code} (expected 401)"
  } | tee "${OUT_DIR}/webhook-probe-summary.txt"

  step "Locale URL probes (ks/mk/pilot + sq/en)"
  {
    for path in /ks/pricing /mk/pricing /pilot/pricing /sq/pricing /en/pricing; do
      code="$(capture_http "probe-${path//\//_}" "${APP_URL%/}${path}")"
      printf "%s -> %s\n" "${APP_URL%/}${path}" "$code"
    done
    echo
    for path in /ks/member/membership/success /mk/member/membership/success /pilot/member/membership/success /sq/member/membership/success /en/member/membership/success; do
      code="$(curl -sS -o /dev/null -w "%{http_code}" -I "${APP_URL%/}${path}" || true)"
      location="$(curl -sS -I "${APP_URL%/}${path}" | awk -F': ' 'tolower($1)=="location"{print $2}' | tr -d '\r' || true)"
      printf "%s -> %s location=%s\n" "${APP_URL%/}${path}" "$code" "${location:-n/a}"
    done
  } | tee "${OUT_DIR}/locale-probe-summary.txt"

  step "Optional targeted tests (local)"
  note "Running minimal tests for checkout and webhook route behavior."
  set +e
  pnpm --filter @interdomestik/web test:unit --run src/components/pricing/pricing-table.test.tsx >"${OUT_DIR}/test-pricing-table.log" 2>&1
  TEST1=$?
  pnpm --filter @interdomestik/web test:unit --run src/app/api/webhooks/paddle/route.test.ts >"${OUT_DIR}/test-paddle-webhook-route.log" 2>&1
  TEST2=$?
  set -e
  {
    echo "pricing-table.test.tsx exit=${TEST1}"
    echo "route.test.ts exit=${TEST2}"
  } | tee "${OUT_DIR}/test-summary.txt"

  step "Manual operator actions required (Paddle sandbox checkout + dashboard + DB)"
  cat <<EOF | tee "${OUT_DIR}/manual-checklist.txt"
1) Ensure Paddle dashboard webhook destination points to:
   ${WEBHOOK_URL}

2) In browser, open:
   ${PRICING_URL}
   - Start checkout from membership/pricing flow.
   - Complete one Paddle sandbox purchase.
   - Record checkout id + event id in ${OUT_DIR}/pilot-evidence-template.md.

3) Confirm redirect behavior:
   - Success should resolve to a locale-prefixed membership success route.
   - Cancel should return to pricing/membership flow (cancelUrl currently may be app-default if unset).

4) In Paddle dashboard:
   - Confirm delivery attempts for the event to ${WEBHOOK_URL}.
   - Confirm HTTP 2xx for at least one delivery.
   - Capture event id and timestamp.

5) In Vercel logs:
   - Filter for POST ${WEBHOOK_PATH}
   - Correlate Paddle event id with log timestamp and 2xx response.

6) In Supabase SQL editor:
   - Run ${OUT_DIR}/supabase-verification.sql
   - Capture before/after rows for user/webhook_events/subscriptions and idempotency check.
EOF

  pause_for_operator "Press Enter after completing the manual Paddle + dashboard + DB steps."

  step "Fetch recent Vercel logs for webhook path"
  set +e
  vercel logs "${APP_URL#https://}" --prod --no-branch --since 1h >"${OUT_DIR}/vercel-logs-last-1h.txt" 2>&1
  VERCEL_LOG_EXIT=$?
  set -e
  note "Saved: ${OUT_DIR}/vercel-logs-last-1h.txt (exit=${VERCEL_LOG_EXIT})"

  step "Checklist complete"
  note "Fill and attach: ${OUT_DIR}/pilot-evidence-template.md"
  note "Share artifacts from: ${OUT_DIR}"
}

main "$@"
