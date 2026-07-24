---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-CD-DG01
slice: IDA-CD01
revision: R1
date: 2026-07-23
authority: root-orchestrator
---

# IDA-CD-DG01 — Staging Alias Rollback Guard

## Decision

Promote exactly one CD/Staging stabilization slice: `IDA-CD01`.

`IDA-CD01` adds a fail-closed preimage and rollback control for the canonical
staging alias. It does not run a deployment from this gate and does not authorize
production.

The implementation must snapshot the exact deployment currently serving
`staging.interdomestik.com` before the alias is moved. After confirmed alias
movement, any later non-cancellation failure in the same staging attempt,
including health, build-provenance, canonical-alias or staging E2E failure, must
run one bounded rollback job that restores the exact preimage deployment and
verifies that the canonical staging health endpoint is reachable again. Failure
before confirmed alias movement must not run rollback.

Revision R1 supersedes the original 11,131-byte artifact at SHA-256
`7402ae763f5d89085ef4d8fdeaa7b82068258f5a186b77103653fce7dd253507`
after current-head Codex P2 `PRRT_kwDOQ0Mhjc6TKlHo`. That superseded hash and
its review receipt are historical only and do not approve this revision.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `0b85b20af3ce8cf2b28608a1c9e47a7499704291`
- Branch: `main`
- Upstream: `origin/main`
- Resolver: `blocked_requires_current_authority`
- Resolver reason: `umbrella_without_concrete_promoted_slice`
- Active slice before this gate: `null`
- AI OS observation:
  `af801910bbffe0aa70394926c3497d42dcf037b9566bb81e526a292acdb29220`
- AI OS runtime state before this gate: `not_authorized`

Brain retrieval was attempted with current-source and active-execution requirements
and failed closed because its source snapshot is stale. It is not used as authority
and no usefulness or ROI claim is made.

## Current Evidence

1. `.github/workflows/cd.yml` deploys a unique Vercel staging candidate and then
   assigns `staging.interdomestik.com` inside the deploy action before
   `e2e-staging` runs.
2. `scripts/ci/configure-vercel-gate-url.mjs` performs the canonical staging alias
   assignment.
3. Alias assignment occurs before the deploy action's remaining health,
   build-provenance and canonical-alias checks. A failure in those checks makes
   `deploy-staging` red and skips `e2e-staging` after alias movement; the current
   workflow restores no prior target for that path or for failed staging E2E.
4. Main CD run `28699456479` built and deployed staging, after which both staging
   E2E attempts failed. That is direct evidence that post-alias verification can
   fail.
5. RBAC closeout run `28740614586` later produced two consecutive green staging
   E2E jobs, but its caveat does not create a rollback control.
6. Main CD run `29754025696`, job `88391630887`, failed in the staging image build
   with `exit 137` / `cannot allocate memory`. This is a separate runner-capacity
   residual and is not silently folded into this slice.
7. Exact-main CD run `29962796062` was intentionally cancelled during Buildx
   setup before registry login, image build, alias movement or deployment.
8. GitHub currently reports only one online repository runner:
   `interdomestik-mac-Arbens-Mac-mini` with label `interdomestik-mac`.
9. The HP Z620 is the accepted local development-infrastructure host. It is not a
   registered GitHub Actions runner in current evidence and is not a migration
   target for this slice.
10. Local Vercel CLI credentials are absent/invalid, so the orchestrator must not
    rely on an out-of-band local rollback after a failed staging deployment.

## Goal And Outcome

Primary operator: release/platform operator.

Business outcome: a failed post-deploy staging gate cannot leave the canonical
staging alias pointing at the failed candidate without a deterministic,
current-run rollback attempt.

Entry point: the existing push-to-`main` staging CD lane.

Exit state:

- successful post-alias deploy verification plus staging E2E keeps the new alias
  target;
- any non-cancellation failure after confirmed alias movement restores the exact
  pre-run alias target, including deploy verification or staging E2E failure;
- a failure before confirmed alias movement leaves the existing alias unchanged;
- a missing, ambiguous or unverifiable preimage fails before alias mutation;
- rollback failure is a hard red operational incident with bounded evidence;
- production remains skipped for ordinary push events.

## Exact Future Writer Map

Only these seven repository paths may change:

1. `.github/workflows/cd.yml`
2. `.github/actions/trigger-digest-verified-deploy/action.yml`
3. `scripts/ci/configure-vercel-gate-url.mjs`
4. `scripts/ci/vercel-staging-alias-state.mjs` — new
5. `scripts/ci/vercel-staging-alias-state.test.mjs` — new
6. `scripts/ci/cd-deploy-env-scope.test.mjs`
7. `scripts/repo-size-budget.json` — deterministic sync only

Any eighth writer path stops the slice for a fresh exact disposition.

New production/test files must remain below 150 lines. The modified
`configure-vercel-gate-url.mjs` must not grow; alias API logic should move into
the new focused module.

## Required Behavior

### Preimage

- Resolve the current canonical staging alias through the authenticated Vercel
  alias API before the new alias assignment.
- Accept only `staging.interdomestik.com` as the canonical staging alias.
- Accept only a valid Vercel deployment hostname as the preimage target.
- Resolve that hostname through the authenticated deployment API and require its
  project and team identifiers to exactly match the existing job-scoped
  `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID`; hostname syntax or prefix matching
  alone is insufficient.
- Capture the prior `/api/health` build commit SHA without logging secrets or raw
  provider responses.
- Export only the normalized previous deployment hostname and full lowercase
  commit SHA as job/action outputs.
- A missing alias, missing commit, malformed hostname, redirect, provider error or
  ambiguous response must fail before alias mutation.

### Alias move

- Preserve the current verified-candidate alias assignment and retry semantics.
- Emit a normalized, non-secret same-run alias-moved control immediately after
  canonical assignment succeeds and before post-alias verification. Preserve it
  for downstream evaluation even when a later deploy-action check fails.
- Do not weaken the Vercel output attestation, image digest, health, provenance or
  canonical-alias verification.
- Do not introduce shell interpolation of provider response fields.

### Rollback

- Add one staging-only rollback job that evaluates after the terminal
  `deploy-staging` state and, when scheduled, the terminal `e2e-staging` state.
- It may run only when the same run confirms alias movement, the run is not
  cancelled, and either a later `deploy-staging` check failed or
  `e2e-staging` failed.
- It must not require successful `deploy-staging` as a prerequisite when the
  same run proves alias movement before the later deploy-action failure.
- It must not run for a failure before alias movement or for a fully successful
  staging path.
- It must use the exact preimage hostname and commit captured by the same run.
- It must restore only `staging.interdomestik.com`.
- It must verify canonical `/api/health` against the captured preimage commit.
- It must upload a bounded, redacted rollback receipt even when restoration fails.
- Rollback failure remains red and must not be converted to success.
- A cancelled run must not start a new deployment or production action. If a run
  is cancelled after alias movement, automatic rollback is not claimed: staging
  is frozen, production remains untouched, and the captured preimage receipt is
  surfaced for a fresh incident authority that may restore only that exact
  preimage. Operators must not manually cancel between alias movement and the
  terminal staging E2E result except for an active security or provider incident.

## Acceptance Evidence

Required deterministic tests:

1. snapshot succeeds for one exact alias/deployment/commit;
2. missing alias fails closed;
3. malformed deployment hostname fails closed;
4. a syntactically valid deployment from another Vercel project or team fails
   closed;
5. provider error is bounded and redacted;
6. restore assigns only the canonical staging alias;
7. restore verifies the exact preimage commit;
8. restore mismatch fails hard;
9. each post-alias health, build-provenance or canonical-alias failure triggers
   rollback even when `deploy-staging` is red and `e2e-staging` is skipped;
10. failed staging E2E after successful deploy verification triggers rollback;
11. cancelled-after-alias movement does not claim automatic recovery and exposes
    the bounded preimage receipt for fresh incident authority;
12. normal push events keep every production job skipped;
13. successful deploy verification plus staging E2E does not execute rollback;
14. credentials remain job/action scoped;
15. current attestation and digest contracts remain intact;
16. rollback exits non-zero even when its redacted receipt uploads successfully.

Focused proof:

- `node --test scripts/ci/vercel-staging-alias-state.test.mjs`
- `node --test scripts/ci/cd-deploy-env-scope.test.mjs`
- `node --test scripts/ci/cd-attestation-contract.test.mjs`
- `pnpm repo:size:check`
- `git diff --check`

`scripts/ci/cd-deploy-env-scope.test.mjs` is the exact authorized home for the
workflow-structure contracts covering rollback conditions, cancellation
disposition, production skips and rollback non-execution after successful E2E.
No separate workflow contract test file is authorized.

`scripts/ci/cd-attestation-contract.test.mjs` is read-only proof and is frozen
outside the writer map. If the implementation requires changing it, the slice
stops for a fresh exact gate amendment rather than adding an eighth path.

Because the future implementation changes CD/provider-control infrastructure, it
is Tier 3 and must also pass the repository's required current-head review,
security and CI gates before merge.

Post-merge staging execution is separate evidence. It may use only the exact
push-triggered CD run for the merged `main` SHA. Production jobs must be skipped.
The execution must prove build, attestation, staging deploy, exact-SHA health,
canonical alias provenance, staging P0 E2E, artifact upload and rollback
non-execution on success. If build fails before alias movement, capture the exact
resource failure and return to fresh authority for one runner-capacity slice.

## Failure And Recovery

- Snapshot failure: no alias movement; stop.
- Build failure or `exit 137`: no alias movement; capture evidence; stop.
- Deploy failure before alias movement: capture evidence; stop.
- Health, build-provenance or canonical-alias failure after confirmed alias
  movement: restore exact preimage and verify it.
- E2E failure after alias movement: restore exact preimage and verify it.
- Cancellation after alias movement: do not claim automatic rollback; freeze
  staging, keep production untouched, surface the bounded preimage receipt and
  return to fresh incident authority for exact-preimage restoration.
- Restore failure: hard red incident; do not retry deployment, do not touch
  production, and surface the provider/job evidence.
- P0.1 agent/staff marker miss: restore preimage, freeze follow-on product
  exposure and return to current authority under the existing RBAC caveat.

## Explicit Exclusions

This gate does not authorize:

- any deployment, rerun, alias change or provider call now;
- production build, deploy, promote, rollback, alias or evidence action;
- automatic staging deployment trigger redesign;
- workflow-dispatch production semantics;
- Dockerfile, package, dependency or lockfile changes;
- runner registration, label changes, service changes or migration;
- moving CD from the Mac runner to the HP Z620;
- changing Z620 PostgreSQL, Forgejo, tunnel, backup or restore automation;
- Vercel project/environment/secret configuration changes;
- database, schema, migration, RLS or Supabase changes;
- proxy, routing, auth, session, tenancy or shared-auth changes;
- product UI, Claim Draft Intake, ClaimWizard, claims, billing or Paddle changes;
- AI runtime, Eval v2, Brain/index/config or AI OS adapter changes;
- frozen `IDA-UI03a2` chain work;
- any successor slice.

## Promotion Boundary

This Tier-0 gate keeps:

- `runtime_authorized:false`
- `deployment_authorized:false`
- `production_authorized:false`

After this exact gate is canonically merged and re-resolved, a separate exact
implementation authority may authorize only the seven-path writer map above.
No other slice is promoted.

The next active governed implementation goal is exactly one canonical tracker
slice: `IDA-CD01`.
