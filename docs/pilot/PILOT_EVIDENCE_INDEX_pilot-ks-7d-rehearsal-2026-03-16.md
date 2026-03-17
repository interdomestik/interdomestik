# Pilot Evidence Index — pilot-ks-7d-rehearsal-2026-03-16

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260316T204146Z-pilot-ks-7d-rehearsal-2026-03-16`.

- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Created at: `2026-03-16T20:41:46.095Z`
- Release gate report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
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
- `PD02` for `pilot-ks-7d-rehearsal-2026-03-16` is an intentional same-date control replay on `2026-03-16`; the rollback tag stays keyed to the pilot-entry artifact date, while readiness cadence still evaluates consecutive qualifying day numbers rather than requiring unique calendar dates.

- Keep one row per operating day.
- Capture the release report path in every row. If the day uses the same pilot-entry report, reuse that `docs/release-gates/...` path.
- Use absolute or repo-relative bundle paths exactly as generated.
- If no gate bundle was generated that day, set bundle path to `n/a`.
- A qualifying readiness-cadence day requires `green`, `0` incidents, `none` highest severity, `continue`, and a valid `docs/release-gates/...` report path.
- Record observability evidence for every daily and weekly review window before the decision row so log sweep, KPI condition, and incident severity are linked directly into the decision artifact.
- Do not edit this template directly; always work in your copied per-pilot evidence index file.

| Day | Date (YYYY-MM-DD) | Owner                   | Status (`green`/`amber`/`red`) | Release Report Path                                                          | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |
| --- | ----------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   | 2026-03-16        | platform                | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 2   | 2026-03-16        | platform                | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 3   | 2026-03-16        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 4   | 2026-03-17        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 5   | 2026-03-17        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 6   | 2026-03-17        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | continue                                      |
| 7   | 2026-03-17        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md | n/a                  | 0                 | none                                      | pause                                         |

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

| Reference | Date (YYYY-MM-DD) | Owner    | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ----------------- | -------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day-1     | 2026-03-16        | platform | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| day-2     | 2026-03-16        | platform | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | pilot:check passed; stale rollback tag corrected locally after merge advanced HEAD                                                                                                                                                                                                                                                                                                                                                                  |
| day-3     | 2026-03-16        | Admin KS | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Fresh rerun on 2026-03-17: pnpm pilot:check exited 0; targeted PD03 proofs also green (pilot closed-loop 1 passed, branch dashboard 12 passed, member diaspora gate 2 passed). Remaining console noise was expected negative-path auth and access-deny coverage from tenant-resolution and portal-isolation specs.                                                                                                                                  |
| day-4     | 2026-03-17        | Admin KS | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-17 rerun passed: pilot:check 5/5 green; targeted PD04 proofs also green (matter allowance 2, staff queue 4, branch dashboard 12). Pressure remained visible but bounded.                                                                                                                                                                                                                                                              |
| day-5     | 2026-03-17        | Admin KS | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-17 rerun passed: pilot:check 5/5 green; targeted PD05 proofs also green (register attribution, tenant resolution, group privacy, RBAC scope, and C2 denial paths). Remaining console noise was expected Better Auth invalid-user and deny-path coverage only.                                                                                                                                                                         |
| day-6     | 2026-03-17        | Admin KS | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-17 rerun passed: pilot:check 5/5 green; Day 6 communications proofs stayed green (messaging persistence, cross-agent denial, internal-note isolation, contact and notification tests); remote D07 alerts unchanged. Controlled rollback-tag drill initially found a stale local tag, then passed after canonical rebind of pilot-ready-20260316 to current HEAD 5cd4be8e95382c41667c050d5f97dd5e8b76639e.                             |
| day-7     | 2026-03-17        | Admin KS | expected-noise                                         | 0                         | 1                            | watch                                               | 0              | none                                      | Fresh 2026-03-17 closeout rerun passed: readiness cadence PASS; remote D07 alerts unchanged; rollback-tag verification required local annotated-tag repair, then pilot-ready-20260316 was rebound to current HEAD 1d798c207acf80b1f9383d396b9b6dae8fc0b7ba; fresh pilot:check exited 0. Recommendation remains bounded because the repo-backed closeout set still lacks a quantitative week-1 KPI and SLA rollup proving the Day 7 threshold lines. |
| week-1    | 2026-03-17        | Admin KS | expected-noise                                         | 0                         | 1                            | watch                                               | 0              | none                                      | Weekly executive review closed with no Sev1/Sev2 incident and no fresh product-surface regression. Days 1-6 stayed repo-backed and bounded, Day 7 fresh verification stayed green, and the checked-in week-1 KPI or SLA rollup now confirms that the remaining blocker is claim-based threshold proof before controlled live-pilot expansion is reconsidered. See `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-7d-rehearsal-2026-03-16.md`.          |

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
| daily                          | day-1     | 2026-03-16        | platform | continue                                      | n/a                                            | day-1             | no                                 | no                                                                     |
| daily                          | day-2     | 2026-03-16        | platform | continue                                      | pilot-ready-20260316                           | day-2             | no                                 | no                                                                     |
| daily                          | day-3     | 2026-03-16        | Admin KS | continue                                      | n/a                                            | day-3             | no                                 | no                                                                     |
| daily                          | day-4     | 2026-03-17        | Admin KS | continue                                      | n/a                                            | day-4             | no                                 | no                                                                     |
| daily                          | day-5     | 2026-03-17        | Admin KS | continue                                      | n/a                                            | day-5             | no                                 | no                                                                     |
| daily                          | day-6     | 2026-03-17        | Admin KS | continue                                      | n/a                                            | day-6             | no                                 | no                                                                     |
| daily                          | day-7     | 2026-03-17        | Admin KS | pause                                         | n/a                                            | day-7             | yes                                | no                                                                     |
| weekly                         | week-1    | 2026-03-17        | Admin KS | pause                                         | n/a                                            | week-1            | yes                                | no                                                                     |
