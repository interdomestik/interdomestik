# v1.0.0 Pilot Entry Package

This package turns the current `v1.0.0` recommendation into a concrete pilot-entry path.

It does not replace the canonical authority in:

- `docs/pilot/PILOT_RUNBOOK.md`
- `docs/pilot/PILOT_GO_NO_GO.md`

It narrows and applies that authority to the `v1.0.0` decision.

## Decision Posture

Treat `v1.0.0` as a pilot release decision, not as expansion approval.

That posture matches the current canonical evidence:

- the prior process-proof line closed successfully
- cadence proof passed
- expansion remained `no`
- any further continuation requires a new bounded objective and an explicit end condition

Primary evidence:

- `docs/pilot/PILOT_CLOSEOUT_pilot-ks-process-proof-2026-03-25.md`
- `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-process-proof-2026-03-20.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-process-proof-2026-03-20.md`

## New Pilot ID

Use a fresh pilot id for the `v1.0.0` release window.

Default:

```bash
export PILOT_ID="pilot-ks-v1-0-0-<YYYY-MM-DD>"
```

Do not reuse:

- `pilot-ks-live-2026-03-18`
- `pilot-ks-process-proof-2026-03-20`

## Required Entry Commands

Run the canonical ranked flow in this order from merged `main`:

```bash
pnpm pilot:check
pnpm release:gate:prod -- --pilotId "$PILOT_ID"
pnpm pilot:tag:ready -- --pilotId "$PILOT_ID" --date <YYYY-MM-DD>
```

Then confirm that the canonical pilot-entry artifact set exists:

- `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
- the matching pointer row in `docs/pilot-evidence/index.csv`

## Required Entry Success Criteria

The `v1.0.0` pilot entry is valid only if all of the following are true:

1. `pnpm pilot:check` exits `0`
2. `pnpm release:gate:prod -- --pilotId "$PILOT_ID"` exits `0`
3. the copied evidence index is created for the new pilot id
4. the rollback tag `pilot-ready-YYYYMMDD` is created or verified against the same artifact set
5. the current release posture is recorded as pilot-only, not expansion-ready

## Day-1 Entry Recording

Immediately after entry, write the first canonical rows:

```bash
pnpm pilot:evidence:record -- --pilotId "$PILOT_ID" --day 1 --date <YYYY-MM-DD> --owner "<owner>" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a
pnpm pilot:observability:record -- --pilotId "$PILOT_ID" --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise> --functionalErrorCount 0 --expectedAuthDenyCount <n> --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes <repo-path-or-n/a>
pnpm pilot:decision:record -- --pilotId "$PILOT_ID" --reviewType daily --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --decision continue --observabilityRef day-1
```

## Explicit Non-Goals

Do not use this pilot entry to justify:

- tenant expansion
- branch expansion
- broader operator concurrency
- product-scope broadening
- auth or routing refactors

The pilot entry exists to validate the released `v1.0.0` surface under bounded live conditions.
