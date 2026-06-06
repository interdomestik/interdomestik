---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT01 Alert Routing Evidence Contract - 2026-06-06

> Status: Input document. This contract defines the evidence required to prove alert routing for
> the existing SLO alert surface. It does not change Sentry, production telemetry, runtime code,
> incident policy, or claim full enterprise readiness.

## Purpose

Move the first alert-routing enterprise proof from partial evidence to a concrete,
operator-executable contract. A future exercise record can prove that the existing D07 alerts are not
only configured, but routed to a named owner and actionable without creating production impact.

## Current Repo Evidence

Existing alert evidence is useful but incomplete for enterprise readiness:

- `docs/SLOS.md` defines the three committed SLO surfaces.
- `docs/RUNBOOK.md` documents `pnpm sentry:alerts:check` and `pnpm sentry:alerts:apply`.
- `docs/plans/2026-03-09-d07-sentry-burn-rate-alerts-evidence.md` records that the three D07
  Sentry alert rules were present and unchanged after provisioning.
- `scripts/sentry-alerts-lib.mjs` defines the checked-in alert catalog for Paddle webhook burn
  rate, document download burn rate, and `/api/claims` latency.
- `scripts/sentry-alerts.mjs` supports catalog-only checks, remote drift checks, and remote apply
  when Sentry token scopes and action targets are configured.
- `scripts/sentry-alerts.test.mjs` proves catalog shape, payload construction, drift detection, and
  action parsing.
- Prior pilot records include remote D07 drift checks that found the rules unchanged.

The repo does not yet prove:

- named warning and critical routing targets from current Sentry state;
- owner or escalation identity for each D07 alert action;
- that an alert can be exercised without production traffic or customer impact;
- that the exercise creates a visible notification the receiving owner can acknowledge, triage, and
  record; or
- dedicated auth, RLS, tenant-boundary, or protected-route failure-mode alert catalog coverage beyond
  the current D07 surfaces.

## Scope

This contract covers the existing D07 SLO alert catalog and the evidence required to prove routing
for Paddle webhook processing, document download availability, and `/api/claims` latency. It is the
first alert-routing proof contract, not the full alerting-backed observability lane.

In scope: remote drift check, warning and critical action inventory, named owner and escalation
destination, no-production-impact exercise, notification receipt, acknowledgement, pass/fail
decision, and follow-up capture.

Out of scope: production incidents, traffic degradation, threshold changes, observability-vendor
replacement, runtime code, schema, RLS, auth, tenancy, routing, billing, product UI, proxy, README,
AGENTS, broad architecture docs, and secrets or sensitive customer data in evidence.

## Evidence Template

Copy this section into a dated exercise record when a real routing proof is performed.

```md
# Alert Routing Exercise Record - YYYY-MM-DD

## Identity

- Exercise id:
- Environment:
- Sentry org/project:
- Alert catalog source:
- Executed by:
- Decision/escalation owner:

## Alert Inventory

| Alert                                        | Remote rule id | Query | Warning action | Critical action | Owner | Drift result |
| -------------------------------------------- | -------------- | ----- | -------------- | --------------- | ----- | ------------ |
| D07 SLO1 Paddle webhook processing burn rate |                |       |                |                 |       |              |
| D07 SLO2 Document download burn rate         |                |       |                |                 |       |              |
| D07 SLO3 Core API latency p95 (/api/claims)  |                |       |                |                 |       |              |

## Exercise

- Exercise method:
- Production traffic affected: no
- Test alert/notification id:
- Trigger time:
- First notification received time:
- Acknowledged by:
- Acknowledged time:
- Triage destination:
- Follow-up record:

## Commands And Evidence

- Drift check command:
- Drift check result:
- Routing-action inspection:
- Exercise command/provider action:
- Notification evidence location:

## Safety

- Secrets or credentials exposed in this record: no
- Raw PII, claim narratives, document contents, or payment data exposed: no
- Exercise used staging-safe, test-only, or provider-supported alert simulation: yes/no

## Result

- Decision: pass/fail
- Blocking findings:
- Non-blocking findings:
- Follow-up issue or PR:
- Owner sign-off:
```

## Acceptance Criteria

An alert-routing exercise record satisfies this contract only when:

- each checked-in D07 alert has a remote rule id and `pnpm sentry:alerts:check --json` reports no
  missing or changed D07 rules;
- warning and critical actions are inspected and recorded for each remote rule;
- each action maps to a named owner, channel, or escalation destination;
- the exercise uses a non-production-impact test path and records the exact method;
- at least one routed notification is proven received and acknowledged by the intended owner;
- the record captures trigger time, first received time, acknowledgement time, and triage
  destination;
- the evidence contains no secrets, credentials, raw PII, claim narratives, document contents, or
  payment data;
- a named decision owner records pass/fail; and
- every blocker has a follow-up issue, PR, or explicit risk owner.

This contract does not satisfy the broader enterprise alert lane by itself. Full alerting-backed
observability still requires separate catalog and exercise proof for auth, RLS or tenant-boundary,
and protected-route failure modes.

## Recommended Next Proof

The next unblocked enterprise slice should create `ENT-ALERT02 D07 Alert Routing Exercise Record` by
executing this contract against the current Sentry project. If the available token can read rules but
not inspect action details, trigger test notifications, or confirm recipient delivery, record the
exact provider permission or destination blocker instead of claiming routing proof.
