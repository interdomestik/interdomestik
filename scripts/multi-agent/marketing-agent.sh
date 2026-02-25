#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${ROOT_DIR}/tmp/multi-agent/marketing"
SURFACE="both"
STRICT=0
MIN_SCORE=85

SCORE=0
MAX_SCORE=0
PASS_COUNT=0
FAIL_COUNT=0

PASS_FINDINGS=()
FAIL_FINDINGS=()
RECOMMENDATIONS=()

usage() {
  cat <<'USAGE'
Usage: bash scripts/multi-agent/marketing-agent.sh [options]

Runs deterministic UX/CRO checks for member dashboard + landing hero surfaces and
produces a scorecard report.

Options:
  --surface <member-dashboard|landing-hero|both>  Audit target (default: both)
  --log-dir <path>                                 Output directory for reports
  --strict                                         Exit non-zero when score < --min-score
  --min-score <0-100>                              Minimum passing score in strict mode (default: 85)
  -h, --help                                       Show this help
USAGE
}

fail() {
  printf '[marketing-agent] FAIL: %s\n' "$1" >&2
  exit 1
}

print_context() {
  if [[ -n "${MULTI_AGENT_CONTEXT_BUNDLE:-}" && -f "${MULTI_AGENT_CONTEXT_BUNDLE:-}" ]]; then
    printf '[marketing-agent] context-bundle=%s\n' "$MULTI_AGENT_CONTEXT_BUNDLE"
    printf '[marketing-agent] context-files=%s\n' "${MULTI_AGENT_CONTEXT_FILES:-unknown}"
  else
    printf '[marketing-agent] context-bundle=none\n'
  fi
}

record_pass() {
  local weight="$1"
  local title="$2"
  SCORE=$((SCORE + weight))
  MAX_SCORE=$((MAX_SCORE + weight))
  PASS_COUNT=$((PASS_COUNT + 1))
  PASS_FINDINGS+=("${title} (+${weight})")
}

record_fail() {
  local weight="$1"
  local title="$2"
  local recommendation="$3"
  MAX_SCORE=$((MAX_SCORE + weight))
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAIL_FINDINGS+=("${title} (+0/${weight})")
  if [[ -n "$recommendation" ]]; then
    RECOMMENDATIONS+=("$recommendation")
  fi
}

contains_pattern() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q -- "$pattern" "$file"
    return $?
  fi

  grep -Eq -- "$pattern" "$file"
}

check_pattern() {
  local weight="$1"
  local file="$2"
  local pattern="$3"
  local title="$4"
  local recommendation="$5"

  if contains_pattern "$pattern" "$file"; then
    record_pass "$weight" "$title"
  else
    record_fail "$weight" "$title" "$recommendation"
  fi
}

check_count_at_least() {
  local weight="$1"
  local file="$2"
  local regex="$3"
  local min_count="$4"
  local title="$5"
  local recommendation="$6"
  local count

  if command -v rg >/dev/null 2>&1; then
    count="$(rg -o -- "$regex" "$file" | wc -l | tr -d ' ')"
  else
    count="$(grep -Eo -- "$regex" "$file" | wc -l | tr -d ' ')"
  fi

  if [[ "$count" -ge "$min_count" ]]; then
    record_pass "$weight" "${title} (count=${count})"
  else
    record_fail "$weight" "${title} (count=${count}, expected>=${min_count})" "$recommendation"
  fi
}

check_member_dashboard_locales() {
  local weight="$1"
  local messages_root="$2"
  local output

  if output="$(
    node - "$messages_root" <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const locales = ['en', 'mk', 'sq', 'sr'];
const requiredKeys = [
  'dashboard.member.home.hero.title',
  'dashboard.member.home.cta.help_now',
  'dashboard.member.home.qa.title',
  'dashboard.member.home.footer.privacy',
];

function hasNestedKey(obj, keyPath) {
  return keyPath.split('.').every(key => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      obj = obj[key];
      return true;
    }
    return false;
  });
}

const missing = [];
for (const locale of locales) {
  const filePath = path.join(root, locale, 'dashboard.json');
  if (!fs.existsSync(filePath)) {
    missing.push(`${locale}:dashboard.json`);
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const keyPath of requiredKeys) {
    if (!hasNestedKey(payload, keyPath)) {
      missing.push(`${locale}:${keyPath}`);
    }
  }
}

if (missing.length > 0) {
  console.log(missing.join(', '));
  process.exit(1);
}

console.log('ok');
NODE
  )"; then
    record_pass "$weight" "Member-home localization coverage (en/mk/sq/sr)"
  else
    record_fail \
      "$weight" \
      "Member-home localization coverage (missing: ${output})" \
      "Fill missing keys in dashboard message files so marketing copy stays consistent in all pilot locales."
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --surface)
      [[ $# -ge 2 ]] || fail 'missing value for --surface'
      SURFACE="$2"
      shift 2
      ;;
    --log-dir)
      [[ $# -ge 2 ]] || fail 'missing value for --log-dir'
      LOG_DIR="$2"
      shift 2
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    --min-score)
      [[ $# -ge 2 ]] || fail 'missing value for --min-score'
      MIN_SCORE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if ! [[ "$MIN_SCORE" =~ ^[0-9]+$ ]] || [[ "$MIN_SCORE" -gt 100 ]]; then
  fail '--min-score must be an integer between 0 and 100'
fi

case "$SURFACE" in
  member-dashboard|landing-hero|both) ;;
  *)
    fail "--surface must be one of: member-dashboard, landing-hero, both"
    ;;
esac

MEMBER_DASHBOARD_FILE="$ROOT_DIR/apps/web/src/components/dashboard/member-dashboard-v2.tsx"
LANDING_PAGE_FILE="$ROOT_DIR/apps/web/src/app/[locale]/page.tsx"
LANDING_HERO_FILE="$ROOT_DIR/apps/web/src/app/[locale]/components/home/hero-v2.tsx"
MESSAGES_ROOT="$ROOT_DIR/apps/web/src/messages"

[[ -f "$MEMBER_DASHBOARD_FILE" ]] || fail "missing file: $MEMBER_DASHBOARD_FILE"
[[ -f "$LANDING_PAGE_FILE" ]] || fail "missing file: $LANDING_PAGE_FILE"
[[ -f "$LANDING_HERO_FILE" ]] || fail "missing file: $LANDING_HERO_FILE"

mkdir -p "$LOG_DIR"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
REPORT_FILE="$LOG_DIR/marketing-scorecard-${RUN_ID}.md"

print_context

if [[ "$SURFACE" == "member-dashboard" || "$SURFACE" == "both" ]]; then
  check_pattern \
    10 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="member-dashboard-ready"' \
    'Member dashboard readiness contract marker exists' \
    'Keep member clarity marker stable so CRO/E2E flows remain deterministic.'
  check_pattern \
    10 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="member-hero"' \
    'Member hero section exists' \
    'Ensure the member page opens with a single, high-clarity hero section.'
  check_pattern \
    8 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="dashboard-heading"' \
    'Hero headline contract exists' \
    'Keep a single clear value proposition headline in the first fold.'
  check_pattern \
    8 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="cta-get-help-now"' \
    'Primary urgency CTA exists' \
    'Expose one primary high-intent CTA (help now / start claim) above the fold.'
  check_pattern \
    8 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="member-start-claim-cta"' \
    'Secondary conversion CTA exists' \
    'Keep a secondary CTA to reduce decision dead-ends for members not ready to call.'
  check_pattern \
    8 \
    "$MEMBER_DASHBOARD_FILE" \
    'data-testid="member-hero-trust-row"' \
    'Trust proof row exists near hero CTA cluster' \
    'Add trust badges close to CTA buttons to reinforce conversion confidence.'
  check_count_at_least \
    8 \
    "$MEMBER_DASHBOARD_FILE" \
    "testId: 'qa-[^']+'" \
    6 \
    'Quick action density is high enough for action discovery' \
    'Add direct quick-action cards to reduce navigation friction.'
  check_pattern \
    6 \
    "$MEMBER_DASHBOARD_FILE" \
    'FunnelEvents\.retentionPulse' \
    'Retention analytics event is wired' \
    'Instrument hero/CTA interactions to compare copy and layout variants safely.'
  check_member_dashboard_locales 14 "$MESSAGES_ROOT"
fi

if [[ "$SURFACE" == "landing-hero" || "$SURFACE" == "both" ]]; then
  check_pattern \
    8 \
    "$LANDING_PAGE_FILE" \
    'data-testid="landing-page-ready"' \
    'Landing page readiness marker exists' \
    'Preserve landing clarity marker for stable funnel experiments.'
  check_pattern \
    8 \
    "$LANDING_PAGE_FILE" \
    'HeroV2' \
    'Landing HeroV2 is mounted from home page' \
    'Ensure modern hero variant is mounted in UI v2 path.'
  check_pattern \
    8 \
    "$LANDING_HERO_FILE" \
    'data-testid="hero-v2-help-call"' \
    'Landing hero primary call CTA exists' \
    'Expose immediate support CTA for high-intent visitors.'
  check_pattern \
    8 \
    "$LANDING_HERO_FILE" \
    'data-testid="hero-v2-start-claim"' \
    'Landing hero start-claim CTA exists' \
    'Keep a low-friction start CTA for users not ready to call.'
  check_pattern \
    6 \
    "$LANDING_HERO_FILE" \
    'data-testid="hero-v2-trust-row"' \
    'Landing trust row exists' \
    'Place social-proof/trust micro-signals directly under hero actions.'
  check_pattern \
    6 \
    "$LANDING_HERO_FILE" \
    'data-testid="hero-v2-digital-id-preview"' \
    'Concrete product proof is visible in hero context' \
    'Add a concrete product proof card to increase perceived legitimacy.'
  check_pattern \
    6 \
    "$LANDING_PAGE_FILE" \
    'FunnelLandingTracker' \
    'Landing funnel tracker exists for experiment readout' \
    'Track variant + locale + tenant to validate CRO experiments with data.'
fi

if [[ "$MAX_SCORE" -eq 0 ]]; then
  fail 'no checks executed; verify --surface options'
fi

SCORE_PERCENT=$((SCORE * 100 / MAX_SCORE))

{
  printf '# Marketing Agent Scorecard\n\n'
  printf -- '- Generated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf -- '- Surface: `%s`\n' "$SURFACE"
  printf -- '- Score: `%s/%s` (`%s%%`)\n' "$SCORE" "$MAX_SCORE" "$SCORE_PERCENT"
  printf -- '- Passed checks: `%s`\n' "$PASS_COUNT"
  printf -- '- Failed checks: `%s`\n\n' "$FAIL_COUNT"

  printf '## Passed\n'
  if [[ "${#PASS_FINDINGS[@]}" -eq 0 ]]; then
    printf -- '- None\n'
  else
    for finding in "${PASS_FINDINGS[@]}"; do
      printf -- '- %s\n' "$finding"
    done
  fi

  printf '\n## Failed\n'
  if [[ "${#FAIL_FINDINGS[@]}" -eq 0 ]]; then
    printf -- '- None\n'
  else
    for finding in "${FAIL_FINDINGS[@]}"; do
      printf -- '- %s\n' "$finding"
    done
  fi

  printf '\n## Recommendations\n'
  if [[ "${#RECOMMENDATIONS[@]}" -eq 0 ]]; then
    printf -- '- No remediation needed from deterministic checks.\n'
  else
    for recommendation in "${RECOMMENDATIONS[@]}"; do
      printf -- '- %s\n' "$recommendation"
    done
  fi
} >"$REPORT_FILE"

printf '[marketing-agent] score=%s/%s (%s%%)\n' "$SCORE" "$MAX_SCORE" "$SCORE_PERCENT"
printf '[marketing-agent] report=%s\n' "$REPORT_FILE"

if [[ "$STRICT" -eq 1 && "$SCORE_PERCENT" -lt "$MIN_SCORE" ]]; then
  printf '[marketing-agent] strict-mode failure: score %s%% is below minimum %s%%\n' "$SCORE_PERCENT" "$MIN_SCORE" >&2
  exit 1
fi

printf '[marketing-agent] PASS\n'
