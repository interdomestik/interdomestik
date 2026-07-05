---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/plans/2026-07-03-t503-drop-claim-status-closeout.md
  - docs/reviews/2026-07-05-week1-execution-packet.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# B2 Staging RBAC Residual Check

> Status: non-authoritative evidence record. This document records ENT-A01
> verification results only. It does not promote runtime work, close
> `MOB-01b`, or replace `docs/plans/current-program.md` /
> `docs/plans/current-tracker.md`.

Date: 2026-07-05

Purpose: disposition the T-503 staging RBAC/role-marker residual before any
launch-track exposure work. ENT-A01 required two same-day `e2e-staging`
executions against current-main staging. Closure required two green runs.

## Baseline Residual

`docs/plans/2026-07-03-t503-drop-claim-status-closeout.md` recorded that after
T-503 merged at `main@45cc038b9fa036f516fef5c7b9844f2cc3c92d78`, CD run
`28699456479` passed `build-staging` and `deploy-staging`, but `e2e-staging`
failed twice:

- Attempt 1, job `85115834639`: P0.1 role-marker failures for agent and staff
  staging routes after successful login.
- Attempt 2, job `85116379208`: P0.1 agent marker missing plus a P0.3 role-add
  failure.

The Week-1 Execution Packet defined this as a launch-track blocker only if it
reproduced on current `main` staging.

## Current Staging Deployment

- Main SHA tested: `2d0411a40620ad34170a0dc15556ea6db6e9d8ca`
- Commit: `docs: reconcile post-MOB-01 authority (#1298)`
- CD run: `https://github.com/interdomestik/interdomestik/actions/runs/28732941926`
- `build-staging`: success, jobs `85201868772` / `85207136558`.
- `deploy-staging`: success, jobs `85202290899` / `85207127452`.
- Staging base URL: `https://staging.interdomestik.com`
- Release-gate expected SHA: `2d0411a40620ad34170a0dc15556ea6db6e9d8ca`

## Same-Day Executions

1. First execution: `e2e-staging` passed on CD run `28732941926`, job
   `85202744051`:
   `https://github.com/interdomestik/interdomestik/actions/runs/28732941926/job/85202744051`

2. Second execution: job-level rerun of `e2e-staging` failed on the same CD run,
   job `85207127377`:
   `https://github.com/interdomestik/interdomestik/actions/runs/28732941926/job/85207127377`

Artifact uploaded by the failing rerun:
`https://github.com/interdomestik/interdomestik/actions/runs/28732941926/artifacts/8090051153`

## Failure Signature

The second execution failed in `Run Staging Release Gate`:

- `P0.1=FAIL`
- `P0.2=PASS`
- `P0.3=PASS`
- `P0.4=PASS`
- `P0.6=FAIL`

RBAC marker signatures from the rerun:

- `P0.1_RBAC_CANONICAL_MARKER_MISSING account=agent route=/en/agent expected=agent visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true,"rolesTable":false}`
- `P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff route=/en/staff expected=staff visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true,"rolesTable":false}`

Additional failing signatures: `P0.6_S2`, `S3`, `S5`, `S7`, `S8`, and `S9`
closed-browser exceptions.

The `P0.1` failure matches the original residual class: authenticated agent and
staff navigations do not expose their canonical role markers and instead render
a not-found state.

The `P0.3` role-add failure from the second original T-503 attempt did not
reproduce in this rerun; `P0.3` passed.

## RBAC-01 Local Investigation Addendum

RBAC-01 downloaded and inspected the failing artifact locally:

- Artifact source:
  `https://github.com/interdomestik/interdomestik/actions/runs/28732941926/artifacts/8090051153`
- Local artifact path:
  `tmp/rbac-01-artifact/release-gates/2026-07-05_staging_c62a431cf09b.md`

The artifact shows a stabilization race in the scripted gate rather than a
clean deterministic route denial:

- P0.1 treated the canonical `not-found-page` snapshot for `/en/agent` and
  `/en/staff` as terminal after login and one immediate fresh-context retry.
- In the same failing run, P0.6 scenario S1 later observed
  `/en/agent => member=true, agent=true, staff=false, admin=false,
notFound=false`, proving the agent route can render the contractual marker in
  that deployment after the initial P0.1 failure.
- P0.6 staff and later scenarios failed with closed-browser exceptions after
  S1, so staff still requires the post-fix staging rerun proof.

Local RBAC-01 change:

- `scripts/release-gate/p01-rbac-runner.ts` now performs one delayed fresh
  re-probe only for the exact positive canonical not-found signature.
- `scripts/release-gate/p01-rbac-failures.ts` isolates the P0.1 failure
  classification so retry scope stays narrow.
- `scripts/release-gate/p01-rbac-runner.test.ts` and
  `scripts/release-gate/p01-rbac-runner.test-support.ts` add regression
  coverage for the cached failure -> immediate fresh failure -> delayed fresh
  success pattern.

This does not weaken the RBAC gate: marker leaks, wrong-role visibility,
member-role drift, and non-canonical failures are not retried through the new
stabilization path. The contractual marker is still required.

Local proof so far: `node --test scripts/release-gate/p01-rbac-runner.test.ts`
passed; `pnpm test:release-gate` passed with 148 tests; `pnpm plan:audit`,
`pnpm track:audit`, `pnpm docs:verify`, `git diff --check`, and
`pnpm security:guard` passed; `pnpm pr:verify` passed after local prerequisites
were made healthy; `pnpm e2e:gate` passed with 138 tests passed and 8 skipped.

ENT-A01 remains open until this change is deployed to current-main staging and
two consecutive same-day `e2e-staging` jobs pass.

## Verdict

**REPRODUCED:** the T-503 staging RBAC residual reproduced on
`main@2d0411a40620ad34170a0dc15556ea6db6e9d8ca` in CD run `28732941926`, job
`85207127377`, with `P0.1_RBAC_CANONICAL_MARKER_MISSING` for `/en/agent` and
`/en/staff` after successful login.

ENT-A01 is not closed. The launch track remains halted under audit
stop-condition 6, and `MOB-01b` must remain blocked. The active implementation
slice is `RBAC-01`, not a MOB exposure slice.
