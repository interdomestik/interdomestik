# Pilot Evidence Index — pilot-ks-v1-0-0-continuation-2026-03-28

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260328T233133Z-pilot-ks-v1-0-0-continuation-2026-03-28`.

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Created at: `2026-03-28T23:31:33.957Z`
- Release gate report: `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
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

| Day | Date (YYYY-MM-DD) | Owner                   | Status (`green`/`amber`/`red`) | Release Report Path                                                          | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   | 2026-03-28        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md | n/a                  | 0                 | none                                      | continue                                      |
| 2   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 3   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 4   | 2026-03-31        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md | n/a                  | 1                 | sev3                                      | continue                                      |
| 5   | 2026-03-31        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md | n/a                  | 0                 | none                                      | continue                                      |
| 6   | 2026-04-01        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md | n/a                  | 0                 | none                                      | continue                                      |
| 7   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |

Days 2 and 3 remain intentionally blank here. Both windows stayed working-note-only because their live exports were header-only and were not promoted into canonical evidence.

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

| Reference | Date (YYYY-MM-DD) | Owner                   | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ----------------- | ----------------------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day-1     | 2026-03-28        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | GO release gate on dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF; fresh continuation line entered; distinct rollback tag pilot-ready-20260329 created because pilot-ready-20260328 is already bound to the closed v1.0.0 line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| day-4     | 2026-03-31        | Platform Pilot Operator | action-required                                        | 1                         | 0                            | watch                                               | 1              | sev3                                      | Production continuation proof present on Supabase project gunosplgrvnvrftudttr: day-4 export now contains real tenant_ks claim and timeline rows, including YsiT1kPldWd7Rd0QlWltB submitted at 2026-03-31 14:00:49.723295 UTC and advanced to verification with public note at 2026-03-31 14:05:50.651 UTC. Action required: runtime logs on POST /en/member/claims/new show Resend API key invalid (401), and live neutral-host claims in the day-4 cohort currently persist with empty branch_id.                                                                                                                                                                                                                                                                                                                                      |
| day-5     | 2026-03-31        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | watch                                               | 0              | none                                      | Same-day Sev3 follow-up on the corrected baseline is repo-backed in docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-5_claim-proof.md. Pre-deploy control claim y1oCnny4os1NeetXmbPqD still reproduced empty branch_id on the stale production build. After manual deploy dpl_JBv3QJu4zdbFWKjS4sov9H6vEDYx, claim roZ5n4nPbKzsIaxSoxZxe persisted with tenant_ks, branch_id ks_branch_a, and agent_id golden_ks_agent_a1. Resend was then root-caused to an invalid Vercel RESEND_API_KEY, rotated across production, preview, and development, verified against Resend GET /domains with HTTP 200, and re-proved on corrected production deploy dpl_ANDSmMZsQxp9og2bFF7JLmoKot7Q with claim K1GFsZVlumzqzwvw-R6vg. This follow-up clears the two day-4 Sev3 defects but does not change the known progression weakness. |
| day-6     | 2026-04-01        | Platform Pilot Operator | clear                                                  | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Late-day April 1 rerun stable: docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-proof.md and docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-timeline-export.csv; current rollup 2/2 triage, 2/2 public update, 2/2 progression; no fresh branch-attribution or Resend signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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
| daily                          | day-1     | 2026-03-28        | Platform Pilot Operator | continue                                      | n/a                                            | day-1             | no                                 | no                                                                     |
| daily                          | day-4     | 2026-03-31        | Platform Pilot Operator | continue                                      | n/a                                            | day-4             | no                                 | no                                                                     |
| daily                          | day-5     | 2026-03-31        | Platform Pilot Operator | continue                                      | n/a                                            | day-5             | no                                 | no                                                                     |
| daily                          | day-6     | 2026-04-01        | Platform Pilot Operator | continue                                      | n/a                                            | day-6             | no                                 | no                                                                     |
