# SP01 PD01 Release Gate Green Baseline Proof

- Date: `2026-03-16`
- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Scenario: `PD01`
- Final color: `green`
- Final decision: `continue`

## Objective

Prove the new 7-day pilot starts from a fresh pilot id with a green release gate, stable artifact custody, canonical evidence rows, and explicit working-note traceability.

## Artifact Set

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Pointer row: `docs/pilot-evidence/index.csv`
- Daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-1.md`

## Canonical Day 1 Rows

Evidence row:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --day 1 --date 2026-03-16 --owner platform --status green --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md --bundlePath n/a --incidentCount 0 --highestSeverity none --decision continue
```

Observability row:

```bash
pnpm pilot:observability:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reference day-1 --date 2026-03-16 --owner platform --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes n/a
```

Decision row:

```bash
pnpm pilot:decision:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reviewType daily --reference day-1 --date 2026-03-16 --owner platform --decision continue --observabilityRef day-1
```

## Notes

- The release gate stayed green on the fresh pilot id.
- Auth preflight remained informational, not blocking.
- The copied evidence index, pointer row, and daily sheet all reference the same release report path.
- The only observed sequencing issue was the first parallel `RG03` attempt, which was corrected immediately by rerunning decision proof after observability proof in documented order.

## Verdict

- `SP01`: complete
- `SP02`: next
