# v1.0.0 Executive Decision Gate

Date: `2026-03-28`
Pilot ID: `pilot-ks-v1-0-0-2026-03-28`
Decision posture: `pilot only`

## Rule

Do not treat `v1.0.0` as expansion-ready by default.

Any move beyond bounded pilot continuation requires a fresh executive decision on the new pilot id, supported by:

- a fresh pilot-entry artifact set
- a fresh production release-gate proof
- a copied pilot evidence index for the new pilot id
- a rollback-ready tag tied to that same authority line
- an explicit weekly decision and executive review for the same pilot id

## Required Inputs Before Any Expansion Claim

- `pnpm pilot:check` passes on merged `main`
- `pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28` passes
- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-2026-03-28.md` exists
- `docs/pilot-evidence/index.csv` contains the canonical pointer row
- `pilot-ready-20260328` exists or is verified through `pnpm pilot:tag:ready`
- daily evidence, observability, and weekly decision rows exist on the new pilot id
- privacy/RBAC re-proof has been rerun on the corrected baseline
- progression evidence is reviewed explicitly, not inferred from triage/update SLA alone

## Automatic No

Expansion is automatically `no` if any of these is true:

- the new pilot line relies on the closed `pilot-ks-process-proof-2026-03-20` authority instead of its own fresh entry artifacts
- the new line needs post-hoc canonical repair before week-one thresholds are defensible
- privacy, tenancy, or branch-isolation re-proof is missing
- `2 Operating-Day Progression` is still materially below target
- the executive recommendation remains `pause` or `repeat_with_fixes`

## Explicit Decision Fields

These fields must be answered in the executive review for the new pilot id:

- final recommendation: `expand` / `repeat_with_fixes` / `pause` / `stop`
- canonical weekly decision: `continue` / `pause` / `hotfix` / `stop`
- bounded continuation objective, if any
- explicit end condition
- explicit rollback target
- owner
- deadline

## Current Recommendation

As of `2026-03-28`, the correct executive posture is:

- approve a bounded `v1.0.0` pilot release if the fresh pilot-entry authority line is created cleanly
- do not approve expansion
- revisit expansion only after the new pilot line proves clean evidence custody and materially better progression
