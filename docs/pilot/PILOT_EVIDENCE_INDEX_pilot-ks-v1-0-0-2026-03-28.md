# Pilot Evidence Index — pilot-ks-v1-0-0-2026-03-28

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260328T103447Z-pilot-ks-v1-0-0-2026-03-28`.

- Pilot ID: `pilot-ks-v1-0-0-2026-03-28`
- Created at: `2026-03-28T10:34:47.041Z`
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
| 1   | 2026-03-28        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md | n/a                  | 1                 | sev3                                      | pause                                         |
| 2   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 3   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 4   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 5   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 6   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 7   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |

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

| Reference | Date (YYYY-MM-DD) | Owner    | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ----------------- | -------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day-1     | 2026-03-28        | Admin KS | action-required                                        | 0                         | 0                            | watch                                               | 1              | sev3                                      | Initial v1.0.0 pilot-entry line required same-day repair: production auth 429 retries were removed on the corrected baseline, the P0.4 role-removal gate false failure was fixed and merged, PD05B boundary behavior stayed green on the corrected baseline, and the final production release gate passed on docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md. Window does not qualify as clean-without-repair, so expansion remains no. |

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

| Review Type (`daily`/`weekly`) | Reference | Date (YYYY-MM-DD) | Owner    | Decision (`continue`/`pause`/`hotfix`/`stop`) | Rollback Target (`pilot-ready-YYYYMMDD`/`n/a`) | Observability Ref | Resume Requires `pnpm pilot:check` | Resume Requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` |
| ------------------------------ | --------- | ----------------- | -------- | --------------------------------------------- | ---------------------------------------------- | ----------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| daily                          | day-1     | 2026-03-28        | Admin KS | pause                                         | n/a                                            | day-1             | yes                                | no                                                                     |
