# Pilot Evidence Record Day 6 Summary-Row Defect

Date: `2026-04-01`  
Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`  
Owner: `Platform Pilot Operator`

## Defect Summary

`pnpm pilot:evidence:record` reported success for Day 6 on the continuation pilot line, but the copied evidence index still left the Day 6 summary row blank in the top daily table.

The same run family wrote the `day-6` observability row and `day-6` decision row correctly.

## Reproduction

Command run:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 --day 6 --date 2026-04-01 --owner "Platform Pilot Operator" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a --reportPath docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md
```

Observed command output:

- `Updated docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md`
- `Release report path: docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`

Observed repo state immediately after:

- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` contained the new `day-6` observability row
- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` contained the new `day-6` decision row
- the top daily evidence table still showed Day 6 as blank

## Manual Repair Applied

The Day 6 summary row was repaired manually in the copied evidence index with:

- date `2026-04-01`
- owner `Platform Pilot Operator`
- status `green`
- report path `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
- bundle path `n/a`
- incidents `0`
- highest severity `none`
- decision `continue`

This manual repair was required before treating Day 6 as canonically frozen.

## Impact

- pilot operators cannot rely on the success exit and console output from `pnpm pilot:evidence:record` alone
- copied evidence index consistency can drift across the three canonical sections
- day-close freeze requires a direct file check after the command until the defect is fixed

## Current Safe Operator Rule

After every `pnpm pilot:evidence:record` run:

1. inspect the top daily evidence table in `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
2. confirm the intended day row is actually populated
3. only then continue with observability and decision freeze

## Scope Boundary

Day 6 is frozen at the April 1, 2026 late-day snapshot.

Any new production DB activity after that frozen state must be treated as Day 7 or later work, not as Day 6 supplementation.

## Follow-Up

- investigate why `recordPilotDailyEvidence` reported success without updating the visible Day 6 summary row
- add a deterministic regression test that proves the daily table row is updated, not just the file timestamp
- do not rely on Day 6 to close this tooling defect; the defect is separate from the operational pilot evidence
