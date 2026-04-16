# v1.0.0 Expand-Readiness Starter Pack

Use this pack to start a fresh bounded continuation that could later support an explicit `expand` decision.

This pack is for rollout evidence only. It does not authorize expansion by itself.

Use it together with:

- `docs/pilot/V1_0_0_EXECUTIVE_DECISION_GATE.md`
- `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`
- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/LIVE_PILOT_DAILY_EXPORT_GUIDE.md`

## Default Posture

- Default decision remains `pause`.
- Use a fresh pilot id.
- Keep the line bounded.
- Do not infer `expand` from a green gate or a good week alone.

## Inputs

Set these before you create the new line:

```bash
export PILOT_ID="pilot-ks-expand-readiness-<YYYY-MM-DD>"
export PILOT_DATE="<YYYY-MM-DD>"
export PILOT_OWNER="<owner>"
export PILOT_TENANT_ID="tenant_ks"
export PILOT_WINDOW_START="<YYYY-MM-DD>"
export PILOT_WINDOW_END="<YYYY-MM-DD>"
```

## Pre-Start Conditions

Before Day 1, confirm all of these:

1. The placeholder member CTA routes are no longer placeholder-only.
2. Public privacy and cookie pages render localized body copy.
3. `pnpm pilot:check` is expected to pass on current `main`.
4. The next line has a narrow objective and a stop date or explicit end condition.
5. The next line is still bounded and is not an inferred expansion.

## Day-0 File Scaffold

Create the pilot-specific placeholders before live operation starts:

```bash
cp docs/pilot/PILOT_EXEC_REVIEW_TEMPLATE.md "docs/pilot/PILOT_EXEC_REVIEW_${PILOT_ID}.md"
cp docs/pilot/PILOT_WEEK1_KPI_ROLLUP_TEMPLATE.md "docs/pilot/PILOT_WEEK1_KPI_ROLLUP_${PILOT_ID}.md"
cp docs/pilot/PILOT_CLOSEOUT_TEMPLATE.md "docs/pilot/PILOT_CLOSEOUT_${PILOT_ID}.md"
cp docs/pilot/PILOT_DAILY_SHEET_LIVE_TEMPLATE.md "docs/pilot/PILOT_DAILY_SHEET_${PILOT_ID}_day-1.md"
cp docs/pilot/live-data/pilot-claim-timeline-export.template.sql "docs/pilot/live-data/${PILOT_ID}_day-1_claim-timeline-export.sql"
```

Repeat the daily-sheet and SQL copy step for each operating day.

These copied files are the start of canonical evidence custody for the line. Missing day-0 artifacts are a stop condition, not a post-hoc cleanup task.

## Canonical Entry Commands

Run these from merged `main` in this order:

```bash
pnpm pilot:check
pnpm release:gate:prod -- --pilotId "$PILOT_ID"
pnpm pilot:tag:ready -- --pilotId "$PILOT_ID" --date "$PILOT_DATE"
```

After entry, confirm that all of these exist:

- `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
- pointer row for the same pilot id in `docs/pilot-evidence/index.csv`
- rollback tag `pilot-ready-YYYYMMDD`

## Day-1 Canonical Recording

Write the first canonical rows immediately after entry:

```bash
pnpm pilot:evidence:record -- --pilotId "$PILOT_ID" --day 1 --date "$PILOT_DATE" --owner "$PILOT_OWNER" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a
pnpm pilot:observability:record -- --pilotId "$PILOT_ID" --reference day-1 --date "$PILOT_DATE" --owner "$PILOT_OWNER" --logSweepResult clear --functionalErrorCount 0 --expectedAuthDenyCount <n> --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes n/a
pnpm pilot:decision:record -- --pilotId "$PILOT_ID" --reviewType daily --reference day-1 --date "$PILOT_DATE" --owner "$PILOT_OWNER" --decision continue --observabilityRef day-1
```

## Daily Operating Loop

For each operating day:

1. Copy a new live daily sheet from `docs/pilot/PILOT_DAILY_SHEET_LIVE_TEMPLATE.md`.
2. Copy a new SQL export file from `docs/pilot/live-data/pilot-claim-timeline-export.template.sql`.
3. Export the canonical live cohort into `docs/pilot/live-data/${PILOT_ID}_day-N_claim-timeline-export.csv`.
4. Record daily evidence, observability, and decision rows in the copied evidence index.
5. Pause the line if evidence custody degrades and cannot be restored within one operating day.

## Week-1 Rollup Commands

Use the reusable rollup helper against the new pilot window:

```bash
pnpm exec tsx scripts/pilot/query_week1_totals.ts --pilotId "$PILOT_ID" --tenantId "$PILOT_TENANT_ID" --start "$PILOT_WINDOW_START" --end "$PILOT_WINDOW_END"
```

Record the output inside:

- `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<pilot-id>.md`

## Required Decision Artifacts Before Review

All of these must exist before any `repeat_with_fixes` or `expand` recommendation:

- `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
- daily live sheets for the operating days used
- daily export `.csv` and `.sql` files under `docs/pilot/live-data/`
- `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<pilot-id>.md`
- `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md`
- `docs/pilot/PILOT_CLOSEOUT_<pilot-id>.md`

## Expand Defense Checklist

Do not defend `expand` unless all of these are true:

1. the new pilot id has a complete canonical evidence trail
2. no Sev1 exists
3. no unresolved Sev2 older than one operating day exists
4. privacy / RBAC rerun is green
5. triage and public update SLA remain within threshold
6. `2 Operating-Day Progression Rate` is no longer the known weak point
7. the executive review explicitly says why `expand` is justified now

If any one of these is missing, keep the recommendation at `pause`, `repeat_with_fixes`, or `stop`.
