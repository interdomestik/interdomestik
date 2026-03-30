# v1.0.0 Next Steps

This document maps the post-readiness recommendations into concrete repo artifacts.

## Implemented Package

1. Treat `v1.0.0` as a pilot release decision, not expansion approval
   - `docs/pilot/V1_0_0_PILOT_ENTRY_PACKAGE.md`

2. Create a fresh pilot-entry authority line
   - `docs/pilot/V1_0_0_PILOT_ENTRY_PACKAGE.md`

3. Run a fresh production release gate on merged `main`
   - `docs/pilot/V1_0_0_PILOT_ENTRY_PACKAGE.md`
   - uses canonical commands from `docs/pilot/PILOT_RUNBOOK.md`

4. Keep the next pilot scope narrow
   - `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`

5. Make the next objective about clean operation without repair
   - `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`

6. Focus the next window on progression, not just triage/update SLA
   - `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`
   - baseline KPI authority remains `docs/pilot/PILOT_KPIS.md`

7. Rerun Day-5-style privacy / RBAC checks on the corrected baseline
   - `docs/pilot/scenarios/PD05B-privacy-rbac-corrected-baseline.md`

8. Require an explicit executive decision before any expansion or unbounded continuation
   - `docs/pilot/V1_0_0_EXECUTIVE_DECISION_GATE.md`

## Usage Order

Use the package in this order:

1. enter the new `v1.0.0` pilot window with `docs/pilot/V1_0_0_PILOT_ENTRY_PACKAGE.md`
2. operate the window under `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md`
3. rerun privacy / RBAC with `docs/pilot/scenarios/PD05B-privacy-rbac-corrected-baseline.md`
4. make the final bounded-continuation or expansion call with `docs/pilot/V1_0_0_EXECUTIVE_DECISION_GATE.md`

## Current Constraint

This package does not itself create a fresh production release report or a new pilot-entry artifact set. It defines the exact authority path and success criteria for doing so on merged `main`.
