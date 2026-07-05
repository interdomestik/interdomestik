---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
tracker_path: docs/plans/current-tracker.md
related:
  - docs/plans/2026-07-05-rbac-01-current-authority.md
  - docs/plans/2026-07-05-b2-staging-rbac-residual-check.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
---

# RBAC-01 Closeout

> Status: Tier 0 implementation closeout record. This document records the
> RBAC-01 evidence package for the canonical tracker. It does not promote
> runtime work, launch exposure, MOB-01b, country content, billing, schema,
> RLS, migration, routing, proxy, auth/session, tenancy, README, AGENTS, or
> broad architecture work.

## Verdict

`RBAC-01` is closed as **operationally unblocked with a caveat**.

The deterministic T-503 staging RBAC residual was reduced from a reproduced
release blocker to a caveated release-gate stabilization record. Two
consecutive same-day current-main staging `e2e-staging` jobs passed after the
RBAC-01 deployment.

Do not describe the residual as "never reproduced." The first post-deploy
attempt still produced a narrow P0.1 staff marker miss before P0.6 later proved
the staff route in the same gate. Any future current-main staging P0.1
agent/staff marker miss must freeze MOB-01b again and return to current
authority.

## Implementation Evidence

- Implementation PR: `#1299`
- Implementation merge/main SHA:
  `73aa5589cc87efde67f9910ef7413c3484786b3e`
- PR title: `fix: stabilize RBAC release-gate proof`
- Scope: narrow release-gate stabilization for the exact positive canonical
  not-found signature after authenticated agent/staff navigation.
- Protected-surface statement: `apps/web/src/proxy.ts` was untouched; no
  canonical route, marker contract, launch flag, billing, schema/RLS, migration,
  README, AGENTS, or Help Now exposure change was made.

Changed implementation files recorded by the evidence document:

- `scripts/release-gate/p01-rbac-runner.ts`
- `scripts/release-gate/p01-rbac-failures.ts`
- `scripts/release-gate/p01-rbac-runner.test.ts`
- `scripts/release-gate/p01-rbac-runner.test-support.ts`

Local proof recorded in
`docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`:

- `node --test scripts/release-gate/p01-rbac-runner.test.ts`
- `pnpm test:release-gate`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `git diff --check`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`

PR `#1299` remote checks were green before merge, including CI, PR E2E, Pilot
Gate, CodeQL, Secret Scan/gitleaks, Security/pnpm-audit, SonarCloud,
`pr-finalizer`, static, unit, and `e2e-gate`.

## Staging Evidence

Post-RBAC-01 deployment:

- Current-main SHA tested:
  `73aa5589cc87efde67f9910ef7413c3484786b3e`
- CD run:
  `https://github.com/interdomestik/interdomestik/actions/runs/28740614586`
- `build-staging` job:
  `https://github.com/interdomestik/interdomestik/actions/runs/28740614586/job/85222561532`
- `deploy-staging` job:
  `https://github.com/interdomestik/interdomestik/actions/runs/28740614586/job/85223016446`

Same-day `e2e-staging` executions:

1. Failed first attempt:
   `https://github.com/interdomestik/interdomestik/actions/runs/28740614586/job/85223538874`
2. Passed second attempt:
   `https://github.com/interdomestik/interdomestik/actions/runs/28740614586/job/85224725930`
3. Passed third attempt:
   `https://github.com/interdomestik/interdomestik/actions/runs/28740614586/job/85225352625`

The two consecutive green same-day jobs are `85224725930` and `85225352625`.

## Evidence-Record PR

- Evidence PR: `#1300`
- Evidence merge/main SHA:
  `d8ed345767e5aa9102bf48bbe4a4e956bf361771`
- PR title: `docs: record post-RBAC staging evidence`

PR `#1300` preserved the caveated evidence record and had green CI, PR E2E,
Pilot Gate, CodeQL, Secret Scan/gitleaks, Security/pnpm-audit, SonarCloud, and
`pr-finalizer` before merge.

## Current Authority Outcome

`RBAC-01` no longer needs to remain the active governed implementation slice.
The expected resolver state after this closeout is:

- `status=blocked_requires_current_authority`
- `activeSlice=null`
- `reason=umbrella_without_concrete_promoted_slice`

This closeout does not promote `MOB-01b`. `MOB-01b` remains blocked until the
remaining entry evidence is complete:

- L2 country-content sign-off for the selected country pack;
- B6 content-pack hotfix runbook plus one exercise;
- B7 `/help-now` alert coverage proof;
- a later current-authority/design-gate record promotes exactly `MOB-01b`.
