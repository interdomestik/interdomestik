# Pilot Evidence Index — pilot-ks-expand-readiness-2026-04-15

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260415T202117Z-pilot-ks-expand-readiness-2026-04-15`.

- Pilot ID: `pilot-ks-expand-readiness-2026-04-15`
- Created at: `2026-04-15T20:21:17.164Z`
- Release gate report: `docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md`
- Release verdict: `GO`

Populate the daily rows below during pilot operation. Keep the copied file path stable for this pilot ID.

# Pilot Evidence Index Template (7 Days)

For each pilot, copy this template to a per-pilot evidence index file (for example, `PILOT_EVIDENCE_INDEX.md`) and use that copied file as the single source of truth for daily pilot ops evidence.

Preferred flow:

- run `pnpm release:gate:prod -- --pilotId <pilot-id>` for the pilot-entry artifact set
- let the runner create `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` from this template on first use
- record each operating day in that copied file with `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`
- record each daily or weekly observability checkpoint in that same copied file with `pnpm pilot:observability:record -- --pilotId <pilot-id> ...`
- record each daily or weekly continue/pause/hotfix/stop decision in that same copied file with `pnpm pilot:decision:record -- --pilotId <pilot-id> ...`
- create or verify rollback tags with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` before referencing `pilot-ready-YYYYMMDD` in a decision row
- keep updating that copied file for the same pilot id across the 7-day rehearsal window

- Keep one row per operating day.
- Capture the release report path in every row. If the day uses the same pilot-entry report, reuse that `docs/release-gates/...` path.
- Use absolute or repo-relative bundle paths exactly as generated.
- If no gate bundle was generated that day, set bundle path to `n/a`.
- A qualifying readiness-cadence day requires `green`, `0` incidents, `none` highest severity, `continue`, and a valid `docs/release-gates/...` report path.
- Record observability evidence for every daily and weekly review window before the decision row so log sweep, KPI condition, and incident severity are linked directly into the decision artifact.
- Do not edit this template directly; always work in your copied per-pilot evidence index file.

| Day | Date (YYYY-MM-DD) | Owner | Status (`green`/`amber`/`red`) | Release Report Path | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----- | ------------------------------ | ------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1 | 2026-04-16 | Platform Pilot Operator | green | docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md | docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-1_claim-timeline-export.csv | 0 | none | continue |
| 2 | 2026-04-17 | Platform Pilot Operator | green | docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md | docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-2_claim-timeline-export.csv | 0 | none | continue |
| 3 | 2026-04-20 | Platform Pilot Operator | green | docs/release-gates/2026-04-15_production_dpl_3TpgxBv2mYmeHVrt25PWRCoGE1t1.md | docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-3_claim-timeline-export.csv | 0 | none | continue |
| 4 |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |  |

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

| Reference | Date (YYYY-MM-DD) | Owner | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes |
| --------- | ----------------- | ----- | ---------------------------------------------------- | ------------------------- | ------------------------------ | ------------------------------------------------- | -------------- | ----------------------------------------- | ----- |
| entry-base | 2026-04-15 | Platform Pilot Operator | clear | 0 | 0 | watch | 0 | none | entry baseline recorded; PD01 pre-open support green; live window opens 2026-04-16 |
| day-1 | 2026-04-16 | Platform Pilot Operator | clear | 0 | 0 | watch | 0 | none | PD01 live-day custody restored with same-day CSV |
| day-2 | 2026-04-17 | Platform Pilot Operator | clear | 0 | 0 | watch | 0 | none | PD02 progression verified |
| day-3 | 2026-04-20 | Platform Pilot Operator | clear | 0 | 0 | watch | 0 | none | PD03 progression verified |
| week-1 | 2026-04-22 | Platform Pilot Operator | clear | 0 | 0 | watch | 0 | none | PD05B passed on corrected baseline |

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

| Review Type (`daily`/`weekly`) | Reference | Date (YYYY-MM-DD) | Owner | Decision (`continue`/`pause`/`hotfix`/`stop`) | Rollback Target (`pilot-ready-YYYYMMDD`/`n/a`) | Observability Ref | Resume Requires `pnpm pilot:check` | Resume Requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` |
| ------------------------------- | --------- | ----------------- | ----- | ---------------------------------------------- | ----------------------------------------------- | ----------------- | ------------------------------------ | --------------------------------------------------------------- |
| daily | entry-base | 2026-04-15 | Platform Pilot Operator | continue | n/a | entry-base | no | no |
| daily | day-1 | 2026-04-16 | Platform Pilot Operator | continue | n/a | day-1 | no | no |
| daily | day-2 | 2026-04-17 | Platform Pilot Operator | continue | n/a | day-2 | no | no |
| daily | day-3 | 2026-04-20 | Platform Pilot Operator | continue | n/a | day-3 | no | no |
| weekly | week-1 | 2026-04-22 | Platform Pilot Operator | pause | n/a | week-1 | yes | no |
