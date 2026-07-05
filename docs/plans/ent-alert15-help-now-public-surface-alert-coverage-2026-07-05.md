---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/plans/ent-alert11-auth-rls-protected-route-provider-alert-catalog-contract-2026-06-06.md
  - docs/plans/ent-alert12-auth-rls-protected-route-provider-drift-check-evidence-2026-06-06.md
  - docs/manual/runbook-content-pack-hotfix.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# ENT-ALERT15 Help Now Public Surface Alert Coverage - 2026-07-05

> Status: B7 alert-coverage contract. This document defines the coverage and
> evidence required for the public Help Now surface. It does not create, update,
> delete, route, or acknowledge provider alerts; generate production traffic; or
> claim non-dark launch readiness.

## Identity

- Slice id: `ENT-ALERT15-2026-07-05`
- Surface: public `/:locale/help-now`
- Provider considered: Sentry project used by the existing `ent-alert` lineage
- Runtime touched: no
- Provider mutated: no
- Production traffic generated: no
- Decision owner: platform

## Required Failure Modes

| Category                | Minimum coverage required                                              | Evidence before B7 done    |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------- |
| Public route error      | `/:locale/help-now` render or server error spike                       | provider rule or monitor   |
| Pack manifest failure   | missing, invalid, or stale `content-packs.v1.json`                     | provider rule or monitor   |
| Service-worker failure  | SW install/update/cache failure for public Help Now assets             | provider rule or monitor   |
| Cache-guard violation   | public cache contains member/session/local incident-bundle data        | release gate + alert path  |
| Funnel pipeline failure | anonymous Help Now funnel events stop or error above threshold         | monitor or dashboard alert |
| Dark-state drift        | unsigned country leaves dark/placeholder state without signed evidence | release check + alert path |

## Candidate Alert Catalog

The exact provider queries must be selected from current telemetry before rule
creation. These names are reserved for the future provider catalog:

| Rule id                               | Provider rule name                                    | Runtime status       | Coverage claim |
| ------------------------------------- | ----------------------------------------------------- | -------------------- | -------------- |
| `ent-alert-help-now-route`            | `[ENT] Help Now public route error coverage`          | dark route exists    | not proven     |
| `ent-alert-help-now-pack-manifest`    | `[ENT] Help Now content-pack manifest coverage`       | pack manifest exists | not proven     |
| `ent-alert-help-now-sw-cache`         | `[ENT] Help Now service-worker/cache coverage`        | SW exists            | not proven     |
| `ent-alert-help-now-funnel`           | `[ENT] Help Now funnel pipeline coverage`             | funnel events exist  | not proven     |
| `ent-alert-help-now-dark-state-drift` | `[ENT] Help Now unsigned-country dark-state coverage` | dark state exists    | not proven     |

Rules must use low-cardinality tags only. Do not include tenant ids, member ids,
claim ids, document ids, emails, cookies, tokens, raw request bodies, private
destination identifiers, or full URLs with user-controlled parameters.

## Exercise Record Template

Copy this section into a dated record when the synthetic staging proof is run.

```md
# Help Now Alert Coverage Exercise Record - YYYY-MM-DD

## Identity

- Environment:
- Provider/project:
- Public route checked:
- Deployed SHA:
- Executed by:
- Alert owner:
- Decision owner:

## Inventory

| Failure mode     | Provider rule id | Query/signal | Warning action | Critical action | Owner | Drift result |
| ---------------- | ---------------- | ------------ | -------------- | --------------- | ----- | ------------ |
| route error      |                  |              |                |                 |       |              |
| pack manifest    |                  |              |                |                 |       |              |
| SW/cache         |                  |              |                |                 |       |              |
| cache guard      |                  |              |                |                 |       |              |
| funnel pipeline  |                  |              |                |                 |       |              |
| dark-state drift |                  |              |                |                 |       |              |

## Synthetic Staging Proof

- Production traffic affected: no
- Synthetic method:
- Trigger id/time:
- First notification received:
- Acknowledged by:
- Acknowledged time:
- Triage destination:
- Evidence location:

## Safety

- Secrets exposed in this record: no
- Raw PII or customer data exposed: no
- Private alert destination exposed: no
- Runtime/provider mutation authorized separately: yes/no

## Result

- B7 result: pass/fail/blocked
- Blocking findings:
- Non-blocking findings:
- Follow-up owner:
- Owner sign-off:
```

## Acceptance Criteria

B7 is complete only when a future record proves:

- every required failure mode has a provider rule, monitor, or explicit
  documented blocker;
- warning and critical actions map to a named owner, team, channel, or
  escalation path without private destination details;
- at least one staging-safe synthetic signal is observed in the provider;
- at least one routed alert is received and acknowledged by the intended owner;
- route, pack, SW/cache, cache-guard, funnel, and dark-state coverage are not
  inferred from release gates alone;
- no secrets, raw PII, claim contents, document contents, payment data, mailbox
  bodies, or private destination identifiers are written to the repo; and
- every blocker has a follow-up owner and next action.

## Current Result

- Alert contract written: yes
- Provider rules confirmed: no
- Synthetic staging alert fired: no
- B7 launch blocker cleared: no
