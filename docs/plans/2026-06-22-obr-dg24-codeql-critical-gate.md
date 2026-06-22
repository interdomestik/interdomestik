---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-22
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime or security-tooling work.

# OBR-DG24: Critical CodeQL Remediation Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-503c` closeout and selects one bounded security remediation
implementation slice.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority records.

Risk tier for the promoted future slice: Tier 3, because the future
implementation touches app-facing egress behavior, release/security tooling
command execution, and shared verification surfaces.

## Revalidated Authority Evidence

| Source                    | Evidence                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis              | `codex/obr-dg24-codeql-critical-gate` is attached to `origin/main` at `ebcfc84a67dcc09b6d12fd2a1f876dfa0cc04556`, equal to the delegated authority. |
| `T-503c` implementation   | PR `#1162` merged from final head `285ec63fdace2cfe42cdeb671462ae36650b811d` with merge commit `5b8b6c4d05adf2344625374a9b79402744159d53`.          |
| `T-503c` closeout         | PR `#1163` merged at `ebcfc84a67dcc09b6d12fd2a1f876dfa0cc04556`; no replacement implementation slice was promoted by that closeout.                 |
| Resolver before this gate | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.            |
| Live CodeQL API           | Open CodeQL alerts revalidated as `86` total: `9` critical, `47` high, and `30` medium.                                                             |
| OP Brain recommendation   | Advisory recommends selecting a Tier 0 current-authority gate that promotes a first implementation batch limited to the 9 critical CodeQL alerts.   |

## Decision

Promote exactly one next governed implementation slice:
`SEC-CQL-01 Critical CodeQL Egress And Command Execution Remediation`.

The future implementation is limited to the currently open critical CodeQL
request-forgery/SSRF and command-line-injection alerts. High and medium alert
classes are explicitly deferred to later current-authority decisions.

## Critical Alert Set

| Alert  | Rule                        | Location                                            |
| ------ | --------------------------- | --------------------------------------------------- |
| `#40`  | `js/request-forgery`        | `apps/web/src/features/health/health.service.ts:69` |
| `#41`  | `js/request-forgery`        | `packages/qa/src/tools/paddle.ts:23`                |
| `#44`  | `js/request-forgery`        | `scripts/release-gate/session-navigation.ts:16`     |
| `#45`  | `js/request-forgery`        | `scripts/release-gate/run.ts:423`                   |
| `#46`  | `js/request-forgery`        | `scripts/release-gate/run.ts:504`                   |
| `#51`  | `js/command-line-injection` | `scripts/release-gate/run.ts:149`                   |
| `#52`  | `js/command-line-injection` | `scripts/run-with-default-db-url.mjs:23`            |
| `#53`  | `js/command-line-injection` | `scripts/run-with-dotenv.mjs:44`                    |
| `#147` | `js/request-forgery`        | `scripts/sentry-alerts.mjs:184`                     |

Alert URLs use
`https://github.com/interdomestik/interdomestik/security/code-scanning/<number>`.

## Promoted Slice Scope

Future `SEC-CQL-01` must remediate or explicitly classify only the 9 critical
alerts above:

- SSRF/request-forgery in health, Paddle QA, release-gate navigation/run, and
  Sentry alert egress paths;
- command-line injection in dotenv/default-DB helper scripts and release-gate
  command execution;
- focused validation helpers and tests needed to prove allowed URL, host,
  protocol, and command/argument boundaries.

For any critical alert that cannot be safely fixed in the first implementation
PR, the worker must classify it as false positive, accepted residual risk, or a
follow-up split with the exact alert URL, owner rationale, and reviewer
disposition.

## Explicit Non-Goals

- No high/medium CodeQL batches: XSS, open or client-side redirects, incomplete
  URL substring sanitization, ReDoS, path injection in QA/tooling, workflow
  permissions, clear-text logging, or broad dependency updates.
- No broad M3, M4, M5, architecture cleanup, unrelated product work, or
  runtime Operational Brain/live AI.
- No auth/session/tenancy/RLS/schema/migrations/billing/product UI redesign.
- No direct destructive `T-503`, `claims.status` drop/rename, or lifecycle
  schema migration.
- No `apps/web/src/proxy.ts`, README, AGENTS, broad architecture-doc rewrite,
  canonical-route change, or clarity-marker change unless separately
  reauthorized.

## Acceptance Evidence Inventory

| Evidence area                | Required proof for the future worker                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CodeQL disposition           | Each critical alert is closed by CodeQL on the PR/current head or has an explicit false-positive/residual-risk/follow-up classification with exact alert URL and rationale.                  |
| URL and egress validation    | Focused tests prove allowed protocol, host, port, path, redirect, and localhost/private-network rejection behavior for affected SSRF paths.                                                  |
| Command execution validation | Focused tests prove command/argument allowlists or safe process APIs reject shell metacharacters, untrusted executables, and environment substitution abuse.                                 |
| Regression scope             | Existing release-gate, Sentry alert, Paddle QA, and health-check intended behaviors still work through typed/sanitized inputs.                                                               |
| Phase C gates                | Local `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` pass unless a gate is blocked by exact documented environment friction and equivalent current-head CI proof is available. |
| Remote checks                | Current-head GitHub CI, Sonar/SonarCloud, CodeQL, gitleaks/Secret Scan, pnpm-audit/Security, pr-finalizer, Pilot Gate, and PR E2E are green or have explicit non-actionable classification.  |
| Feedback disposition         | Copilot/Codex, Sonar, CodeQL/security, and reviewer comments are fixed or explicitly classified before readiness.                                                                            |
| Reviewer routing             | Bounded reviewer routing includes security, QA/gate, and maintainability coverage; Tier 3 protected-surface escalation rules apply if the implementation expands beyond the named files.     |

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs/current-authority gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof, resolver proof, scope audit, and live CodeQL alert
inventory.

## Exit State

Authority is reconciled after `T-503c`. The next active governed implementation
goal is exactly one canonical tracker slice: `SEC-CQL-01`.

Future security remediation must stop at the 9 critical CodeQL alerts unless a
fresh current-authority/design-gate selection promotes another batch.
