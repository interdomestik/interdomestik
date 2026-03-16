# SP02 / PD02 Proof

- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Program tranche: `P8P`
- Scenario: `SP02` / `PD02`
- Date: `2026-03-16`
- Final color: `green`
- Final decision: `continue`

## Objective

Prove that rollback tag discipline, resume inspection, and observability-linked decision proof still work cleanly after the merged `SP01` baseline.

## Inputs

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Day 1 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-1.md`
- Day 2 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-2.md`

## Memory Top-Hit Checks

| Reset item | Retrieval artifact                             | Top hit id             | Top hit trigger                    | Score |
| ---------- | ---------------------------------------------- | ---------------------- | ---------------------------------- | ----- |
| `RG01`     | `tmp/pilot-memory/p8-rg01-pd02-retrieval.json` | `mem_824e576a3e5d46a0` | `pilot.reset_gate.check_failure`   | `10`  |
| `RG03`     | `tmp/pilot-memory/p8-rg03-pd02-retrieval.json` | `mem_fe914e87a2013487` | `pilot.decision.observability_gap` | `10`  |

## Command Results

1. `pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16`
   - exit `1`
   - existing local `pilot-ready-20260316` tag still pointed at pre-merge commit `f746d5663caf249377051ed445abf92c75024c2b`
   - current `HEAD` was `fc29e3ff21ad1b39782ab8718844d49c7f6bceab`

2. `NODE20_BIN="$(dirname "$(npx -y node@20 -p 'process.execPath')")"; PATH="$NODE20_BIN:$PATH" pnpm pilot:check`
   - exit `0`
   - full pilot verification pack succeeded

3. `git tag -d pilot-ready-20260316 && pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16`
   - exit `0`
   - rebound rollback tag to `fc29e3ff21ad1b39782ab8718844d49c7f6bceab`

4. `pnpm pilot:evidence:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --day 2 --date 2026-03-16 --owner platform --status green --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md --bundlePath n/a --incidentCount 0 --highestSeverity none --decision continue`
   - exit `0`

5. `pnpm pilot:observability:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reference day-2 --date 2026-03-16 --owner platform --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes "pilot:check passed; stale rollback tag corrected locally after merge advanced HEAD"`
   - exit `0`

6. `pnpm pilot:decision:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reviewType daily --reference day-2 --date 2026-03-16 --owner platform --decision continue --rollbackTag pilot-ready-20260316 --observabilityRef day-2`
   - exit `0`
   - resume requirements resolved to `pilot:check=no`, `release:gate=no`

7. `pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16`
   - exit `0`
   - verified rollback tag against commit `fc29e3ff21ad1b39782ab8718844d49c7f6bceab`

## Outcome

`PD02` is `green`.

The only failure during the scenario was a stale local rollback tag left behind after `main` advanced beyond the earlier Day 1 commit. That was corrected locally, re-verified, and did not require reopening reset-gate hardening or recording a product defect.

## Canonical Evidence

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Day 2 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-2.md`
- Rollback tag: `pilot-ready-20260316`

## Next

`SP03` / `PD03` can proceed.
