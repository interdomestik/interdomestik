# Pilot Evidence Index — pilot-ks-live-2026-03-18

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run.

- Pilot ID: `pilot-ks-live-2026-03-18`
- Created at: `2026-03-18T07:18:51Z`
- Release gate report: `docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Release verdict: `GO`

Populate the daily rows below during pilot operation. Keep the copied file path stable for this pilot ID.

| Day | Date (YYYY-MM-DD) | Owner                   | Status (`green`/`amber`/`red`) | Release Report Path                                                          | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   | 2026-03-18        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 0                 | none                                      | continue                                      |
| 2   | 2026-03-19        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 1                 | sev2                                      | continue                                      |
| 3   | 2026-03-20        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 0                 | none                                      | continue                                      |
| 4   | 2026-03-21        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 2                 | sev3                                      | continue                                      |
| 5   | 2026-03-22        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 0                 | none                                      | continue                                      |
| 6   | 2026-03-23        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 0                 | none                                      | continue                                      |
| 7   | 2026-03-24        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-18_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | docs/pilot/live-data | 0                 | none                                      | continue                                      |

## Bundle Path Convention

- Weekend safety check only:
  - set bundle path to `n/a` and reference ticket/incident log if any.
- Full gate bundle run (`./phase-5-1.sh`):
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`

## Observability Evidence Log

Record one structured observability row for each daily and weekly review window in the same copied evidence index file.

- Use `pnpm pilot:observability:record -- --pilotId <pilot-id> ...` before `pnpm pilot:decision:record`.
- `Reference` should match the review window, usually `day-<n>` for daily reviews and `week-<n>` for weekly reviews.
- `Log Sweep` captures whether production logs are clear, contain only expected authorization-deny noise, or require operator action.
- `KPI Condition` records whether the pilot KPI sheet remains within threshold, is on watch, or is in breach.
- `Notes` can hold `n/a`, a ticket id, or a repo-relative evidence path.

| Reference | Date (YYYY-MM-DD) | Owner                   | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                               |
| --------- | ----------------- | ----------------------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | ----------------------------------- |
| day-1     | 2026-03-18        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Direct DB Verification passed       |
| day-2     | 2026-03-19        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 1              | sev2                                      | Rollback & Resume verified          |
| day-3     | 2026-03-20        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Closed-Loop Role Flow verified      |
| day-4     | 2026-03-21        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | breach                                              | 2              | sev3                                      | SLA Pressure Verified               |
| day-5     | 2026-03-22        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Privacy & RBAC Spot-Stress Verified |
| day-6     | 2026-03-23        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Fallback Ops Verified               |
| day-7     | 2026-03-24        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Week-1 SLA Closeout Verified        |

## Decision Proof Log

Record one explicit decision row for each daily end-of-day review and each weekly review in the same copied evidence index file.

- `continue`: no extra resume re-validation required.
- `pause`: resume requires fresh `pnpm pilot:check`.
- `hotfix`: requires fallback rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before resume.
- `stop`: requires rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before any resume decision.
- `Observability Ref` must point to the matching row in the observability evidence log so the decision stays tied to log-sweep result, KPI condition, and incident severity.
- `pilot-ready-YYYYMMDD` rollback tags must be created or verified with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` so the tag metadata matches the canonical pilot-entry report and copied evidence index for that date.

For `PD07`, keep the canonical daily decision row here and write the executive recommendation separately in:

- `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md`

| Review Type (`daily`/`weekly`) | Reference | Date (YYYY-MM-DD) | Owner                   | Decision (`continue`/`pause`/`hotfix`/`stop`) | Rollback Target (`pilot-ready-YYYYMMDD`/`n/a`) | Observability Ref | Resume Requires `pnpm pilot:check` | Resume Requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` |
| ------------------------------ | --------- | ----------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------- | ----------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| daily                          | day-1     | 2026-03-18        | Platform Pilot Operator | continue                                      | n/a                                            | day-1             | no                                 | no                                                                     |
| daily                          | day-2     | 2026-03-19        | Platform Pilot Operator | continue                                      | pilot-ready-20260318                           | day-2             | no                                 | no                                                                     |
