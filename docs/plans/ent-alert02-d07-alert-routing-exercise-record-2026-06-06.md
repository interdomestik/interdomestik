---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT02 D07 Alert Routing Exercise Record - 2026-06-06

> Status: Input document. This records a read-only D07 alert-routing exercise attempt against the
> current Sentry project. It does not change Sentry, production telemetry, runtime code, incident
> policy, or claim full enterprise readiness.

## Identity

- Exercise id: `ENT-ALERT02-2026-06-06`
- Environment: `production`
- Sentry project slug observed from dotenv and remote rules: `interdmestik-nextjs`
- Alert catalog source: `scripts/sentry-alerts-lib.mjs`
- Executed by: Codex local repo operator
- Decision owner: platform
- Production traffic affected: no

## Method

The exercise used read-only Sentry inspection through the repo-owned alert script and a redacted
action-inventory query. No alert threshold, route, action, owner, production traffic, customer data,
or notification destination was changed.

Commands:

```bash
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json
node scripts/run-with-dotenv.mjs node --input-type=module -e '<redacted action inventory>'
```

## Alert Inventory

| Alert                                         | Remote rule id | Warning action   | Critical action  | Owner | Drift result                       |
| --------------------------------------------- | -------------- | ---------------- | ---------------- | ----- | ---------------------------------- |
| D07 SLO1 Paddle webhook processing burn rate  | `18664`        | email team route | email team route | set   | changed: resolve threshold differs |
| D07 SLO2 Document download burn rate          | `18665`        | email team route | email team route | set   | changed: resolve threshold differs |
| D07 SLO3 Core API latency p95 (`/api/claims`) | `18666`        | email team route | email team route | set   | changed: resolve threshold differs |

Action destination identifiers were intentionally redacted from this repo record. The inspection
proved each warning and critical trigger has one email action with `targetType=team` and a configured
target identifier.

## Drift Result

The read-only drift check reached Sentry and found all three D07 rules present, but exited `1`
because each remote rule differs from the checked-in catalog:

- `resolveThreshold` is set remotely to the warning threshold for each rule.
- The checked-in payload expects `resolveThreshold: null` at the rule and trigger levels.
- No D07 rule was missing.

The exercise therefore does not satisfy `ENT-ALERT01`, which requires zero missing and zero changed
D07 rules before routing proof can pass.

## Notification Exercise

- Exercise method: read-only inventory only
- Test alert or notification id: not created
- First notification received time: not applicable
- Acknowledged by: not applicable
- Acknowledged time: not applicable
- Triage destination: not proven

No provider-supported, no-production-impact alert trigger was available in this repo thread. The
exercise stopped before any notification attempt because the D07 rules were already in a changed
state relative to the repo catalog.

## Safety

- Secrets or credentials exposed in this record: no
- Raw PII, claim narratives, document contents, or payment data exposed: no
- Production traffic changed or degraded: no
- Sentry mutations performed: no

## Result

- Decision: blocked
- Blocking findings:
  - D07 drift check reports all three rules changed due to resolve-threshold mismatch.
  - No no-production-impact notification trigger and recipient acknowledgement were captured.
- Non-blocking findings:
  - All three D07 remote rule ids are present.
  - Every warning and critical trigger has one configured email team action.
  - Every D07 remote rule has an owner set.
- Follow-up slice: `ENT-ALERT03 D07 Resolve-Threshold Drift Disposition`

## Required Follow-Up

`ENT-ALERT03` should decide whether the remote resolve-threshold values are intentional operating
policy or drift from the checked-in catalog. If the checked-in catalog is wrong, the slice may update
`scripts/sentry-alerts-lib.mjs` and focused tests to match the accepted Sentry configuration. If
Sentry must change instead, the slice should record that as a blocker requiring a write-authorized
operator rather than mutating Sentry from this repo thread. After `pnpm sentry:alerts:check --json`
returns zero changed rules, a separate no-production-impact notification exercise can prove
recipient delivery and acknowledgement.
