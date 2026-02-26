# Pipeline #1 Reusable SOP (PR Hardening)

Date: 2026-02-25
Audience: Commander + role threads (`atlas`, `forge`, `sentinel`, `breaker`, optional `pixel`, `gatekeeper`, `scribe`)
Scope: Phase C hardening for a PR branch before finalization.

## Purpose

Run a repeatable, evidence-first hardening pipeline that improves speed through parallel review and improves quality through strict convergence gates.

## Preconditions

1. Worktree is on the target PR branch (not `main`/`master`).
2. `pnpm install --frozen-lockfile` has succeeded.
3. No product-code edits are allowed in role threads unless explicitly authorized.
4. `apps/web/src/proxy.ts` remains read-only.

## Inputs

1. `RUN_ID` (example: `pr-hardening-20260225T142829Z`)
2. Artifact root:
`/Users/arbenlila/development/_wt/interdomestik-v1/tmp/multi-agent/master/<RUN_ID>`
3. Contracts + prompts exist under:
   - `<artifact-root>/*-contract.md`
   - `<artifact-root>/prompts/*.md`
   - `<artifact-root>/run-manifest.md`
   - `<artifact-root>/dispatch-order.md`

## Dispatch Order

1. Parallel wave: `atlas` + `forge` + `sentinel` + `breaker` (+ `pixel` if `ui_touched=yes`)
2. Convergence wave: `gatekeeper` (blocks on all prior required evidence)
3. Final synthesis: `scribe` (blocks on gatekeeper verdict)

## Thread Launch SOP

1. Open one new thread per role in the active wave.
2. Paste that role prompt from `<artifact-root>/prompts/<role>.md`.
3. Require role to end with exact status token:
   - `ATLAS_STATUS: PASS|FAIL`
   - `FORGE_STATUS: PASS|FAIL`
   - `SENTINEL_STATUS: PASS|FAIL`
   - `BREAKER_STATUS: PASS|FAIL`
   - `PIXEL_STATUS: PASS|FAIL` (if present)
   - `GATEKEEPER_STATUS: PASS|FAIL` plus explicit `GO|NO-GO`
   - `SCRIBE_STATUS: PASS|FAIL`
4. Do not start dependent waves until blockers are satisfied.

## Required Evidence (Minimum)

1. `atlas`: base alignment, authoritative diff, risk recommendation.
2. `forge`: logs for `pnpm test:release-gate`, `pnpm check:fast`, `pnpm pr:verify`.
3. `sentinel`: `pnpm security:guard` log plus sensitive-path/secret scans.
4. `breaker`: release-gate diff/help/test and regression notes.
5. `pixel` (if triggered): UI path inventory, clarity/accessibility consistency notes.
6. `gatekeeper`: logs for `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, and final verdict.
7. `scribe`: `executive-summary.md`, `findings-register.md`, `decision-log.md`.

## Quality Gates

A run is eligible for closeout only if:

1. All required role statuses are `PASS`.
2. Gatekeeper verdict is `GO`.
3. Scribe recommendation is explicit and traceable to evidence.
4. Mandatory hard gates are green in evidence:
   - `pnpm pr:verify`
   - `pnpm security:guard`
   - `pnpm e2e:gate`

## Failure Handling

1. If any role returns `FAIL`, stop downstream dispatch.
2. Assign a fixer thread to remediate only the failing scope.
3. Re-run only the failed role and all downstream dependents.
4. If base alignment is ambiguous (`main...HEAD` empty but `origin/main...HEAD` non-empty), reconcile with:
   - `BASE_COMMIT="$(git merge-base HEAD origin/main)"`
   - regenerate authoritative diff and update manifest before resuming.

## Closeout

After `GO` + scribe pass, run:

```bash
pnpm multiagent:finalizer -- --pr <PR_NUMBER> --watch-ci
```

Finalizer must pass:

1. Clean working tree
2. Branch push
3. `pnpm pr:finalize`
4. Required CI checks green

## Reuse Checklist

1. New `RUN_ID` per run.
2. Never reuse old evidence for new branch state.
3. Keep contracts immutable once dispatch starts.
4. Add `pixel` whenever authoritative `ui_touched=yes`.
5. Archive completed run folder under `tmp/multi-agent/master/<RUN_ID>/`.
