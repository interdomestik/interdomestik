# Pilot Evidence Index Template (14 Days, Mon–Sun)

For each pilot, copy this template to a per-pilot evidence index file (for example, `PILOT_EVIDENCE_INDEX.md`) and use that copied file as the single source of truth for daily pilot ops evidence.

Preferred flow:

- run `pnpm release:gate:prod -- --pilotId <pilot-id>` for the pilot-entry artifact set
- let the runner create `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` from this template on first use
- record each operating day in that copied file with `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`
- record each daily or weekly continue/pause/hotfix/stop decision in that same copied file with `pnpm pilot:decision:record -- --pilotId <pilot-id> ...`
- create or verify rollback tags with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` before referencing `pilot-ready-YYYYMMDD` in a decision row
- keep updating that copied file for the same pilot id across the pilot window

- Keep one row per operating day.
- Capture the release report path in every row. If the day uses the same pilot-entry report, reuse that `docs/release-gates/...` path.
- Use absolute or repo-relative bundle paths exactly as generated.
- If no gate bundle was generated that day, set bundle path to `n/a`.
- Do not edit this template directly; always work in your copied per-pilot evidence index file.

| Day | Date (YYYY-MM-DD) | Owner | Status (`green`/`amber`/`red`) | Release Report Path | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----- | ------------------------------ | ------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 2   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 3   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 4   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 5   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 6   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 7   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 8   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 9   |                   |       |                                |                     |                      |                   |                                           |                                               |
| 10  |                   |       |                                |                     |                      |                   |                                           |                                               |
| 11  |                   |       |                                |                     |                      |                   |                                           |                                               |
| 12  |                   |       |                                |                     |                      |                   |                                           |                                               |
| 13  |                   |       |                                |                     |                      |                   |                                           |                                               |
| 14  |                   |       |                                |                     |                      |                   |                                           |                                               |

## Bundle Path Convention

- Weekend safety check only:
  - set bundle path to `n/a` and reference ticket/incident log if any.
- Full gate bundle run (`./phase-5-1.sh`):
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`

## Decision Proof Log

Record one explicit decision row for each daily end-of-day review and each weekly review in the same copied evidence index file.

- `continue`: no extra resume re-validation required.
- `pause`: resume requires fresh `pnpm pilot:check`.
- `hotfix`: requires fallback rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before resume.
- `stop`: requires rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before any resume decision.
- `pilot-ready-YYYYMMDD` rollback tags must be created or verified with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` so the tag metadata matches the canonical pilot-entry report and copied evidence index for that date.

| Review Type (`daily`/`weekly`) | Reference | Date (YYYY-MM-DD) | Owner | Decision (`continue`/`pause`/`hotfix`/`stop`) | Rollback Target (`pilot-ready-YYYYMMDD`/`n/a`) | Resume Requires `pnpm pilot:check` | Resume Requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` |
| ------------------------------ | --------- | ----------------- | ----- | --------------------------------------------- | ---------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
