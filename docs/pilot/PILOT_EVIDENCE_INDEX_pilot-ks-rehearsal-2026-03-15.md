# Pilot Evidence Index — pilot-ks-rehearsal-2026-03-15

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260315T233739Z-pilot-ks-rehearsal-2026-03-15`.

- Pilot ID: `pilot-ks-rehearsal-2026-03-15`
- Created at: `2026-03-15T23:37:39.223Z`
- Release gate report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Release verdict: `GO`

Populate the daily rows below during pilot operation. Keep the copied file path stable for this pilot ID.

# Pilot Evidence Index Template (14 Days, Mon–Sun)

For each pilot, copy this template to a per-pilot evidence index file (for example, `PILOT_EVIDENCE_INDEX.md`) and use that copied file as the single source of truth for daily pilot ops evidence.

Preferred flow:

- run `pnpm release:gate:prod -- --pilotId <pilot-id>` for the pilot-entry artifact set
- let the runner create `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` from this template on first use
- record each operating day in that copied file with `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`
- record each daily or weekly observability checkpoint in that same copied file with `pnpm pilot:observability:record -- --pilotId <pilot-id> ...`
- record each daily or weekly continue/pause/hotfix/stop decision in that same copied file with `pnpm pilot:decision:record -- --pilotId <pilot-id> ...`
- create or verify rollback tags with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` before referencing `pilot-ready-YYYYMMDD` in a decision row
- keep updating that copied file for the same pilot id across the pilot window

- Keep one row per operating day.
- Capture the release report path in every row. If the day uses the same pilot-entry report, reuse that `docs/release-gates/...` path.
- Use absolute or repo-relative bundle paths exactly as generated.
- If no gate bundle was generated that day, set bundle path to `n/a`.
- A qualifying readiness-cadence day requires `green`, `0` incidents, `none` highest severity, `continue`, and a valid `docs/release-gates/...` report path.
- Record observability evidence for every daily and weekly review window before the decision row so log sweep, KPI condition, and incident severity are linked directly into the decision artifact.
- Do not edit this template directly; always work in your copied per-pilot evidence index file.

| Day | Date (YYYY-MM-DD) | Owner                   | Status (`green`/`amber`/`red`) | Release Report Path                                                          | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   | 2026-03-15        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 2   | 2026-03-16        | Platform Pilot Operator | red                            | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 1                 | sev2                                      | hotfix                                        |
| 3   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 4   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 5   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 6   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 7   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 8   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 9   |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 10  |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 11  |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 12  |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 13  |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |
| 14  |                   |                         |                                |                                                                              |                      |                   |                                           |                                               |

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

| Reference | Date (YYYY-MM-DD) | Owner    | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                               |
| --------- | ----------------- | -------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day-1     | 2026-03-15        | Admin KS | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | rerun on 2026-03-16: release gate GO on dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1; all P0/P1/G07-G10 checks passed; recoverable auth 429 retries were absorbed by the runner without contract failure                                                        |
| day-2     | 2026-03-16        | Admin KS | action-required                                        | 0                         | 0                            | watch                                               | 1              | sev2                                      | PD02 action-required: pilot:check failed in db:rls:test with Tenant or user not found; direct vercel logs operator command in docs no longer matches installed CLI 48.10.2; release report P1.5.1 remained green on the canonical 2026-03-16 GO run |

## Decision Proof Log

Record one explicit decision row for each daily end-of-day review and each weekly review in the same copied evidence index file.

- `continue`: no extra resume re-validation required.
- `pause`: resume requires fresh `pnpm pilot:check`.
- `hotfix`: requires fallback rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before resume.
- `stop`: requires rollback tag plus fresh `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId <pilot-id>` before any resume decision.
- `Observability Ref` must point to the matching row in the observability evidence log so the decision stays tied to log-sweep result, KPI condition, and incident severity.
- `pilot-ready-YYYYMMDD` rollback tags must be created or verified with `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` so the tag metadata matches the canonical pilot-entry report and copied evidence index for that date.

| Review Type (`daily`/`weekly`) | Reference | Date (YYYY-MM-DD) | Owner    | Decision (`continue`/`pause`/`hotfix`/`stop`) | Rollback Target (`pilot-ready-YYYYMMDD`/`n/a`) | Observability Ref | Resume Requires `pnpm pilot:check` | Resume Requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` |
| ------------------------------ | --------- | ----------------- | -------- | --------------------------------------------- | ---------------------------------------------- | ----------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| daily                          | day-1     | 2026-03-15        | Admin KS | continue                                      | n/a                                            | day-1             | no                                 | no                                                                     |
| daily                          | day-2     | 2026-03-16        | Admin KS | hotfix                                        | pilot-ready-20260316                           | day-2             | yes                                | yes                                                                    |
