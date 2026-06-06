---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT03 D07 Resolve-Threshold Drift Disposition - 2026-06-06

> Status: Input document. This records the disposition for the D07 resolve-threshold drift found by
> `ENT-ALERT02`. It does not mutate Sentry, production telemetry, runtime code, incident policy, or
> claim full enterprise readiness.

## Decision

The remote D07 resolve-threshold values are accepted as intentional operating policy. The repo-owned
Sentry catalog now models each D07 alert as resolving at its warning threshold instead of `null`.

Rationale:

- The remote values are consistent across all three D07 rules.
- Each remote resolve threshold equals that rule's warning threshold.
- Accepting the current remote policy avoids a write-scoped Sentry mutation from this repo thread.
- A warning-threshold resolve policy is conservative for burn-rate and latency recovery because it
  requires the metric to return below the warning line before Sentry resolves the alert.

## Repo Update

- `scripts/sentry-alerts-lib.mjs` now builds D07 metric-alert payloads with
  `resolveThreshold = alert.thresholds.warning` at the rule and trigger levels.
- `scripts/sentry-alerts.test.mjs` keeps focused diff coverage aligned with warning-threshold
  resolution for read-only remote checks.

## Verification

Read-only remote check after the catalog update:

```bash
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json
```

Expected result:

- mode: `remote-check`
- project: `interdmestik-nextjs`
- environment: `production`
- missing: `0`
- changed: `0`
- unchanged D07 rules:
  - `18664` `[D07] SLO1 Paddle webhook processing burn rate`
  - `18665` `[D07] SLO2 Document download burn rate`
  - `18666` `[D07] SLO3 Core API latency p95 (/api/claims)`

## Safety

- Sentry mutations performed: no
- Production traffic changed or degraded: no
- Secrets or credentials exposed in this record: no
- Raw PII, claim narratives, document contents, or payment data exposed: no

## Remaining Alert-Routing Gap

This closes the resolve-threshold drift blocker only. Passing alert-routing proof still requires a
separate no-production-impact notification exercise proving that at least one intended owner receives
and acknowledges a routed D07 notification.

Next bounded follow-up:

`ENT-ALERT04 D07 Notification Acknowledgement Exercise`
