#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-}"
if [[ "$PHASE" != "pre" && "$PHASE" != "post" ]]; then
  cat <<'EOF'
Usage:
  bash scripts/sentry-seer-sweep.sh pre
  bash scripts/sentry-seer-sweep.sh post
EOF
  exit 1
fi

RUN_ID="${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}"
EVIDENCE_DIR="${EVIDENCE_DIR:-tmp/pilot-evidence/$RUN_ID}"

SCOPE_LOG="$EVIDENCE_DIR/logs"
SCOPE_NOTES="$EVIDENCE_DIR/notes"
STATE_FILE="$EVIDENCE_DIR/.sentry-seer-state.json"

PRE_FILE="$SCOPE_LOG/sentry-issues-window-pre.md"
POST_FILE="$SCOPE_LOG/sentry-issues-window-post.md"
POST_JSON="$SCOPE_LOG/sentry-issues-window-post.json"
NOTES_FILE="$SCOPE_NOTES/seer-findings.md"
AUTOMATION_PAYLOAD_FILE="$SCOPE_LOG/seer-automation-payload.json"
AUTOMATION_RESPONSE_FILE="$SCOPE_LOG/sentry-seer-automation-response.json"

WINDOW_MINUTES="${SENTRY_SWEEP_WINDOW_MINUTES:-60}"
SENTRY_API_BASE_URL="${SENTRY_API_BASE_URL:-https://sentry.io}"
SENTRY_ORG="${SENTRY_ORG:-}"
SENTRY_PROJECT="${SENTRY_PROJECT:-}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"
SENTRY_QUERY="${SENTRY_QUERY:-}"
SENTRY_LIMIT="${SENTRY_LIMIT:-100}"
SENTRY_SEVERITY_THRESHOLD="${SENTRY_SEVERITY_THRESHOLD:-error}"
SENTRY_SEER_AUTOMATION_URL="${SENTRY_SEER_AUTOMATION_URL:-}"
SENTRY_SEER_AUTOMATION_TOKEN="${SENTRY_SEER_AUTOMATION_TOKEN:-}"

mkdir -p "$SCOPE_LOG" "$SCOPE_NOTES"

if [[ "$PHASE" == "pre" ]]; then
  START_TS="$(date -u +%s)"
  START_ISO="$(node -e "process.stdout.write(new Date(Number(process.argv[1]) * 1000).toISOString())" "$START_TS")"
  RUN_REF="${SENTRY_DEPLOY_REF:-${GITHUB_SHA:-unknown}}"

  node - "$STATE_FILE" "$RUN_ID" "$START_TS" "$START_ISO" "$RUN_REF" <<'NODE'
const fs = require('node:fs');
const [,, stateFile, runId, startTs, startedAt, runRef] = process.argv;
const payload = {
  runId,
  startTs: Number(startTs),
  startedAt,
  runRef,
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(stateFile, JSON.stringify(payload, null, 2));
NODE

  cat > "$PRE_FILE" <<EOF
# Sentry Issue Window (Pre-deploy)

- Evidence run: ${RUN_ID}
- Window start (UTC): ${START_ISO}
- Organization: ${SENTRY_ORG:-not configured}
- Project: ${SENTRY_PROJECT:-not configured}
- Environment: ${SENTRY_ENVIRONMENT}
- Deployment ref: ${RUN_REF}
- Window minutes: ${WINDOW_MINUTES}
- Query: ${SENTRY_QUERY:-<none>}
- Threshold: ${SENTRY_SEVERITY_THRESHOLD}
- Status: window opened.
EOF
  exit 0
fi

: "${SENTRY_AUTH_TOKEN:?Set SENTRY_AUTH_TOKEN (Sentry API auth token)}"
: "${SENTRY_ORG:?Set SENTRY_ORG (Sentry organization slug)}"
: "${SENTRY_PROJECT:?Set SENTRY_PROJECT (Sentry project slug)}"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Missing state file: $STATE_FILE" >&2
  exit 1
fi

START_TS="$(node -e "const fs=require('node:fs'); const state=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(state.startTs || ''))" "$STATE_FILE")"
if [[ -z "${START_TS//[[:space:]]/}" ]]; then
  echo "Could not read startTs from state file: $STATE_FILE" >&2
  exit 1
fi

START_ISO="$(node -e "const startTs=Number(process.argv[1]); if (!Number.isFinite(startTs)) { process.exit(1); } process.stdout.write(new Date(startTs * 1000).toISOString())" "$START_TS")"
END_TS="$(date -u +%s)"
END_ISO="$(node -e "process.stdout.write(new Date(Number(process.argv[1]) * 1000).toISOString())" "$END_TS")"

API_URL="${SENTRY_API_BASE_URL%/}/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

curl_args=(
  -sS
  -G
  --max-time 30
  --connect-timeout 10
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}"
  -H "Content-Type: application/json"
  -H "Accept: application/json"
  --url "$API_URL"
  --data-urlencode "statsPeriod=${WINDOW_MINUTES}m"
  --data "limit=${SENTRY_LIMIT}"
  --data "sort=freq"
)

if [[ -n "${SENTRY_QUERY}" ]]; then
  curl_args+=(--data-urlencode "query=${SENTRY_QUERY}")
fi

if [[ -n "${SENTRY_ENVIRONMENT}" ]]; then
  curl_args+=(--data-urlencode "environment=${SENTRY_ENVIRONMENT}")
fi

HTTP_STATUS="$(curl "${curl_args[@]}" -o "$RESPONSE_FILE" -w '%{http_code}' -X GET)"
if [[ "$HTTP_STATUS" != 2* ]]; then
  echo "Sentry API request failed (HTTP $HTTP_STATUS)." >&2
  cat "$RESPONSE_FILE" >&2 || true
  exit 1
fi

node - "$RESPONSE_FILE" "$START_TS" "$END_TS" "$SENTRY_ORG" "$SENTRY_PROJECT" "$SENTRY_ENVIRONMENT" "$WINDOW_MINUTES" "$SENTRY_SEVERITY_THRESHOLD" "$START_ISO" "$END_ISO" "$POST_FILE" "$POST_JSON" "$NOTES_FILE" "$AUTOMATION_PAYLOAD_FILE" <<'NODE'
const fs = require('node:fs');

const [
  ,
  ,
  responseFile,
  startTsRaw,
  endTsRaw,
  org,
  project,
  environment,
  windowMinutes,
  threshold,
  startIso,
  endIso,
  postFile,
  postJsonFile,
  notesFile,
  automationPayloadFile,
] = process.argv;

const startTs = Number(startTsRaw);
const endTs = Number(endTsRaw);
const start = new Date(startTs * 1000);
const end = new Date(endTs * 1000);

const severityOrder = ['debug', 'info', 'warning', 'error', 'fatal'];
function severityRank(level = '') {
  const normalized = String(level).toLowerCase();
  const rank = severityOrder.indexOf(normalized);
  return rank >= 0 ? rank : 0;
}

const minRank = severityRank(threshold);

const body = fs.readFileSync(responseFile, 'utf8');
if (!body.trim()) {
  throw new Error(`Sentry response was empty: ${responseFile}`);
}

const parsed = JSON.parse(body);
const rawIssues = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed.issues)
    ? parsed.issues
    : Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed.data)
        ? parsed.data
        : [];
const issues = Array.isArray(rawIssues) ? rawIssues : [];

const windowed = [];
for (const issue of issues) {
  const lastSeenValue = issue.lastSeen || issue.last_seen || issue.last_activity || issue.dateUpdated;
  const lastSeen = new Date(lastSeenValue);
  if (Number.isNaN(lastSeen.getTime())) {
    continue;
  }
  if (lastSeen < start || lastSeen > end) {
    continue;
  }
  const level = String(issue.level || issue.metadata?.level || 'error').toLowerCase();
  windowed.push({
    id: issue.id || issue.issueId || '',
    shortId: issue.shortId || issue.culprit || '',
    title: issue.title || issue.culprit || '(untitled)',
    level,
    status: issue.status || 'unknown',
    count: issue.count || issue.userCount || 0,
    firstSeen: issue.firstSeen || issue.first_seen || '',
    lastSeen: issue.lastSeen || issue.last_seen || '',
    permalink: issue.permalink || '',
    culprit: issue.culprit || '',
  });
}

windowed.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
const highSeverity = windowed.filter(i => severityRank(i.level) >= minRank);

const issueRows = windowed.length
  ? windowed
      .map(item =>
        `- ${item.shortId || item.id}: ${item.title} (${item.level}) — lastSeen: ${item.lastSeen} — status: ${item.status} ${item.permalink ? `— ${item.permalink}` : ''}`
      )
      .join('\n')
  : '- No issues in the configured time window.';

const postContent = [
  '# Sentry Issue Window (Post-deploy)',
  '',
  `- Organization: ${org}`,
  `- Project: ${project}`,
  `- Environment: ${environment}`,
  `- Window start (UTC): ${startIso}`,
  `- Window end (UTC): ${endIso}`,
  `- Window minutes: ${windowMinutes}`,
  `- Severity threshold: ${threshold}`,
  `- Total issues returned: ${issues.length}`,
  `- Issues in window: ${windowed.length}`,
  `- High-severity issues: ${highSeverity.length}`,
  '',
  '## Windowed issues',
  '',
  issueRows,
  '',
].join('\n');

const noteRows = highSeverity.length
  ? highSeverity
      .map(item => {
        const issueLink = item.permalink ? `- Sentry issue: ${item.permalink}` : '- Sentry issue: N/A';
        return [
          `## ${item.shortId || item.id}`,
          `- Severity: ${item.level}`,
          `- Title: ${item.title}`,
          `- Last seen: ${item.lastSeen}`,
          `- Count: ${item.count}`,
          issueLink,
          '- Seer summary: _Pending_',
          '- Suggested fix: _Pending_',
          '',
        ].join('\n');
      })
      .join('\n')
  : '- No high-severity issues in the window.';

const notes = [
  '# Seer Findings',
  '',
  '## Window',
  `- Environment: ${environment}`,
  `- Organization: ${org}`,
  `- Project: ${project}`,
  `- Window: ${startIso} to ${endIso}`,
  `- High-severity count: ${highSeverity.length}`,
  '',
  '## High severity issues',
  '',
  noteRows,
  '',
  '## Optional automation',
  '',
  'If enabled, post this payload to the configured automation endpoint to create Seer assist tickets and link summaries.',
].join('\n');

const payload = {
  organization: org,
  project,
  environment,
  windowStart: startIso,
  windowEnd: endIso,
  severityThreshold: threshold,
  totalIssuesReturned: issues.length,
  issuesInWindow: windowed.length,
  highSeverityCount: highSeverity.length,
  highSeverityIssues: highSeverity.map(issue => ({
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    level: issue.level,
    status: issue.status,
    lastSeen: issue.lastSeen,
    count: issue.count,
    permalink: issue.permalink,
  })),
};

fs.writeFileSync(postFile, postContent);
fs.writeFileSync(postJsonFile, JSON.stringify(payload, null, 2));
fs.writeFileSync(notesFile, notes);
fs.writeFileSync(automationPayloadFile, JSON.stringify(payload, null, 2));
NODE

if [[ -n "${SENTRY_SEER_AUTOMATION_URL}" ]]; then
  echo "Seer automation URL configured. Posting best-effort payload."
  AUTOMATION_CURL_ARGS=(
    -sS
    -X POST
    --max-time 30
    --connect-timeout 10
    -H "Content-Type: application/json"
    -H "Accept: application/json"
    -d "@${AUTOMATION_PAYLOAD_FILE}"
    -o "$AUTOMATION_RESPONSE_FILE"
    -w "%{http_code}"
    "$SENTRY_SEER_AUTOMATION_URL"
  )
  if [[ -n "${SENTRY_SEER_AUTOMATION_TOKEN}" ]]; then
    AUTOMATION_CURL_ARGS+=( -H "Authorization: Bearer ${SENTRY_SEER_AUTOMATION_TOKEN}" )
  fi

  AUTOMATION_STATUS="$(curl "${AUTOMATION_CURL_ARGS[@]}" || true)"
  if [[ "$AUTOMATION_STATUS" == 2* ]]; then
    echo "Seer automation acknowledged (HTTP ${AUTOMATION_STATUS})."
  else
    echo "Seer automation call not successful (HTTP ${AUTOMATION_STATUS:-unknown}); check ${AUTOMATION_RESPONSE_FILE}." >&2
  fi
fi

echo "Seer deploy evidence collected:"
echo "- Window: ${START_ISO} → ${END_ISO}"
echo "- Output: ${POST_FILE}, ${NOTES_FILE}"
