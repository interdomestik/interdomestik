---
status: design-review
date: 2026-05-09
slice: P33-DG13
title: Post-SEC09 Security Slice Selection
owner: platform
phase: Phase C
---

# P33-DG13 Post-SEC09 Security Slice Selection

## Decision

`P33-DG13` is the docs-only post-SEC09 selection gate for PR `#702`.

`P33-SEC09 CI/Release Seed Credential Hardening` is complete through PR `#701`,
merge commit `4c919c2fa4d33ffe7aea67b2b27e29568f1940a7`.

SEC09 removed shared workflow seeded-user passwords and E2E API placeholder
secrets from seeded CI/release/pilot workflow jobs, added per-run generated and
masked E2E seed/API credentials, preserved deterministic local E2E seed
credentials, kept CD staging/production release gates secret-backed, and wired
the `Workflow seed credential guard` into `pnpm security:guard` plus CI contract
coverage.

The `P33-DG07` CSP blocker remains active. No concrete DG07 unlock condition has
changed, so `P33-SEC03`, `P33-SEC03R`, and CSP Phase 1 enforcement are still not
promotable.

The next bounded security slice is:

`P33-DG14 DB Access Posture Hard-Case Design Review`

This is a design-gate slice, not a direct DB access implementation. SEC04B
already reduced the unclassified DB access posture count from `262` to the
target ceiling of `80`, but the remaining entries were intentionally left as
hard cases that need targeted migration or a narrower design decision rather
than mass-stamping.

DG13 does not implement `P33-DG14`. DB callsite, guard, schema, auth, tenancy,
route, or runtime behavior changes must wait for approval of the DG14 design
gate.

## Inputs

| Input                                         | Relevance                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main` at `4c919c2f`                          | Main is synced after SEC09 merged through PR `#701`.                                                                                                         |
| `P33-DG12`                                    | Promoted exactly one implementation slice, `P33-SEC09 CI/Release Seed Credential Hardening`.                                                                 |
| `P33-SEC09`                                   | Completed the CI/release seeded credential hardening target and added a workflow guard to prevent reintroducing the unsafe literals.                         |
| `docs/security/db-access-posture-burndown.md` | Records the remaining `80` DB posture hard cases and explicitly says they should not be mass-stamped.                                                        |
| `P33-SEC04B`                                  | Final DB posture counts remain `tenant-context=5`, `tenant-scoped=158`, `tenant-predicate=352`, `admin-privileged=0`, `system-exempt=20`, `unclassified=80`. |
| Current CSP state                             | DG07/SEC05 still block CSP Phase 1 enforcement because the current two-header Phase 0 model conflicts with Next nonce extraction behavior.                   |

## SEC09 Closeout

SEC09 closed the CI/release seed credential gap promoted by DG12:

- seeded CI, release-candidate, pilot-gate, and multi-agent workflow jobs export
  generated and masked per-run E2E seed/API credentials before seed, auth-state,
  or release-gate work;
- workflow-level `GoldenPass123!` release-gate role password literals are
  removed from the seeded workflow jobs;
- workflow-level `E2E_API_SECRET: test-secret-placeholder` values are removed
  from the active E2E helper API secret path;
- local zero-config E2E behavior still uses the deterministic local seed
  password fallback;
- the KS workflow pack consumes the same effective password path as seeded E2E
  users;
- CD staging and production release gates remain GitHub-secret-backed;
- `scripts/check-workflow-seed-credentials.mjs` is wired into
  `pnpm security:guard` and covered by focused workflow contract tests.

Residual risk remains:

- the workflow guard covers known unsafe seeded credential literals and helper
  API placeholders, not every possible future credential anti-pattern;
- local deterministic seeded-user credentials intentionally remain for
  zero-config developer and ephemeral CI verification;
- CSP/XSS residual risk remains because CSP Phase 1 enforcement is still
  blocked by the DG07/SEC05 architecture state;
- DB access posture still has the SEC04B hard-case set of `80` unclassified
  entries.

Controlled production / pilot GO remains acceptable only with green gates and
unchanged environment posture. Full hardened-production posture or any `9+/10`
claim remains NO-GO until remaining residual categories are fixed or formally
accepted.

## DG07 CSP Blocker Check

DG13 explicitly preserves the DG07 rule before ranking remaining work.

No unlock condition is met:

1. The resolved web Next version remains covered by the DG07/SEC05 evidence
   state.
2. There is no new evidence of a supported Next header model that lets the repo
   keep a non-nonce enforced CSP beside a nonce-bearing Report-Only CSP while
   still propagating nonces to first-party framework/runtime scripts.
3. There is no approved enforced-CSP architecture change, Trusted Types/SRI
   compensating-control pivot, or retirement of the nonce-migration target.

Therefore:

- `P33-SEC03` remains `blocked-by-architecture`;
- `P33-SEC03R` is not promotable;
- CSP Phase 1 enforcement remains blocked;
- CSP unblock feasibility remains valuable, but not as a SEC03 retry or Phase 1
  enforcement promotion.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                                                                                                  |
| ---: | ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-DG14 DB Access Posture Hard-Case Design Review`          | Promote  | SEC04B intentionally left `80` unclassified DB posture entries as hard cases. After SEC09, this is the highest-value repo-evidenced hardening lane that needs design review before any targeted migration or guard change. |
|    2 | CSP unblock feasibility / non-nonce CSP architecture decision | Defer    | High-value, but DG07 remains unchanged. This should remain a future design gate, not a SEC03 retry or Phase 1 enforcement promotion.                                                                                       |
|    3 | Supply-chain attestation                                      | Defer    | Valid hardened-production work, but less directly tied to a recorded residual evidence set than the SEC04B DB posture hard cases.                                                                                          |
|    4 | Restore drills                                                | Defer    | Important operational maturity work, but not the strongest next bounded repository hardening step.                                                                                                                         |
|    5 | Threat modeling / incident drills                             | Defer    | Useful readiness work, but lower priority than classifying or designing remediation for the remaining tenant-sensitive DB posture hard cases.                                                                              |
|    6 | Data lifecycle automation                                     | Defer    | Relevant to privacy and retention, but broader and less concretely evidenced than the remaining DB posture hard-case set.                                                                                                  |
|    7 | Further CI/release seed credential hardening                  | Defer    | SEC09 closed the promoted credential gap and added a guard. No fresh repo evidence currently outranks the SEC04B DB posture hard cases.                                                                                    |
|    8 | Performance budgets / repo hygiene                            | Defer    | Valuable engineering maturity work, but not the next security or production-professionalism priority.                                                                                                                      |

## Promoted Slice

`P33-DG14 DB Access Posture Hard-Case Design Review`

Scope for the next design-gate slice:

- inspect the remaining SEC04B `80` unclassified DB access posture entries and
  group them by risk, ownership, and likely remediation pattern;
- identify whether the next safe follow-up should be a targeted implementation
  slice, a guard/reporting refinement, or an explicit accepted residual set;
- prioritize webhook/provider-event tenancy, commercial idempotency scoping,
  legacy agent dashboard ownership, and campaign/cron/public engagement
  residue using repo evidence;
- define acceptance criteria for any later DB posture implementation, including
  focused tests and guard/reporting proof;
- preserve the SEC04B rule that the remaining hard cases must not be
  mass-stamped with directives;
- avoid changing product runtime code during the design gate.

The design gate may inspect:

- `docs/security/db-access-posture-burndown.md`;
- `scripts/check-db-access-guard.mjs`;
- `scripts/ci/db-access-baseline.json`;
- focused source callsites referenced by the current DB access posture report;
- `docs/plans/**` for the design-gate record.

The design gate must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs.

## Rejected Alternatives

| Alternative                                        | Decision | Reason                                                                                                                                      |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Promote a direct DB posture implementation now     | Reject   | The remaining `80` entries are explicitly hard cases and need clustering, ownership, and remediation-boundary design before implementation. |
| Promote `P33-SEC03` or `P33-SEC03R` immediately    | Reject   | DG07's unlock conditions have not changed, and SEC03 remains blocked-by-architecture.                                                       |
| Promote CSP Phase 1 enforcement                    | Reject   | Phase 1 remains blocked by the current report-only architecture mismatch and missing enforced-browser proof.                                |
| Reopen CI/release credential hardening immediately | Defer    | SEC09 added the generated credential path and guard; no concrete residual currently outranks the SEC04B DB hard-case evidence set.          |
| Treat controlled production as hardened production | Reject   | Current posture supports controlled production / pilot GO with green gates, not a full hardened-production or `9+/10` claim.                |
| Bundle DB posture, CSP, supply chain, and drills   | Reject   | DG13 selects exactly one bounded next slice; bundling multiple maturity tracks would be too broad.                                          |

## Verification Plan

DG13 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-DG14` is also a design-gate slice. It should run the same
docs/design-gate verification set and must not change product runtime code.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG13.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain
  unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, Storage architecture, and Stripe remain
  untouched.
- DG13 does not promote CSP Phase 1 enforcement.
- DG13 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
