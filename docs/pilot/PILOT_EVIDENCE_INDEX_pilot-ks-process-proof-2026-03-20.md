# Pilot Evidence Index — pilot-ks-process-proof-2026-03-20

Copied from `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` by pilot-entry run `pilot-entry-20260320T144816Z-pilot-ks-process-proof-2026-03-20`.

- Pilot ID: `pilot-ks-process-proof-2026-03-20`
- Created at: `2026-03-20T14:48:16.751Z`
- Release gate report: `docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md`
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
| 1   | 2026-03-21        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | continue                                      |
| 2   | 2026-03-21        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 1                 | sev3                                      | hotfix                                        |
| 3   | 2026-03-21        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | continue                                      |
| 4   | 2026-03-21        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | continue                                      |
| 5   | 2026-03-21        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | continue                                      |
| 6   | 2026-03-21        | Platform Pilot Operator | green                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | continue                                      |
| 7   | 2026-03-21        | Platform Pilot Operator | amber                          | docs/release-gates/2026-03-21_production_dpl_2UES36YJpu2FNSHPNXznY9Jzhfgu.md | n/a                  | 0                 | none                                      | pause                                         |

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

| Reference | Date (YYYY-MM-DD) | Owner                   | Log Sweep (`clear`/`expected-noise`/`action-required`) | Functional Errors (count) | Expected Auth Denies (count) | KPI Condition (`within-threshold`/`watch`/`breach`) | Incident Count | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ----------------- | ----------------------- | ------------------------------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------- | -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day-1     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-21 PD01 rerun stayed GO on current merged main. Base URL probe returned 307 and all contract checks passed. Bounded auth-throttle retries for staff, admin, and office-agent recovered within the gate logic; no Sev1/Sev2 and no functional regression.                                                                                                                                                  |
| day-2     | 2026-03-21        | Platform Pilot Operator | action-required                                        | 0                         | 0                            | watch                                               | 1              | sev3                                      | Day 2 required same-day repo repair: canonical March 21 report was not committed in HEAD, KS workflow seeding intermittently hit local Postgres transport errors, and /[locale]/stats prerender was not resilient to the same failure class. Final pilot:check passed after bounded repair, so the day closes as a hotfix state rather than a clean green control run.                                                  |
| day-3     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Final PD03 reruns on 2026-03-21 passed: seed reset, pilot closed-loop 1 passed, branch dashboard 12 passed, member diaspora gate 2 passed, and pnpm pilot:check exited 0. Remaining noise was expected negative-path auth/access-deny coverage on branch and portal isolation surfaces.                                                                                                                                 |
| day-4     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 0                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-21 rerun passed: pilot:check 5/5 green; targeted PD04 proofs also green (matter allowance 2, staff queue 4, branch dashboard 12). Pressure remained visible but bounded.                                                                                                                                                                                                                                  |
| day-5     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-21 rerun passed: pilot:check 5/5 green; targeted PD05 proofs also green (register attribution, tenant resolution, group privacy, RBAC scope, and C2 denial paths). Remaining console noise was expected Better Auth invalid-user and deny-path coverage only.                                                                                                                                             |
| day-6     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 2                            | within-threshold                                    | 0              | none                                      | Fresh 2026-03-21 rerun passed: pilot:check 5/5 green; Day 6 communications proofs stayed green (messaging persistence, cross-agent denial, internal-note isolation, contact and notification tests); remote D07 alerts unchanged. Controlled rollback-tag drill initially found a stale local tag, then passed after canonical rebind of pilot-ready-20260321 to current HEAD 1eba10631fe97853ec2cfdb016fbf4130281b76f. |
| day-7     | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 1                            | watch                                               | 0              | none                                      | Fresh 2026-03-21 cadence check failed with longest qualifying streak 2/3, remote D07 alert state remained unchanged, rollback-tag readiness was repaired on current HEAD e4fd48e05b716420a21502b85b12b891b0d48054, and the one current-head pilot:check failure narrowed to a transient gate flake because the isolated rerun of the same scenario passed.                                                              |
| week-1    | 2026-03-21        | Platform Pilot Operator | expected-noise                                         | 0                         | 1                            | watch                                               | 0              | none                                      | Week-1 process-proof closeout is evidence-complete and closes directly from canonical records without post-hoc repair, but readiness cadence remains below threshold: longest qualifying streak is 2/3 because all qualifying days are recorded on 2026-03-21. Remote D07 alerts are unchanged and no Sev1/Sev2 incident was recorded.                                                                                  |

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
| daily                          | day-1     | 2026-03-21        | Platform Pilot Operator | continue                                      | n/a                                            | day-1             | no                                 | no                                                                     |
| daily                          | day-2     | 2026-03-21        | Platform Pilot Operator | hotfix                                        | pilot-ready-20260321                           | day-2             | yes                                | yes                                                                    |
| daily                          | day-3     | 2026-03-21        | Platform Pilot Operator | continue                                      | n/a                                            | day-3             | no                                 | no                                                                     |
| daily                          | day-4     | 2026-03-21        | Platform Pilot Operator | continue                                      | n/a                                            | day-4             | no                                 | no                                                                     |
| daily                          | day-5     | 2026-03-21        | Platform Pilot Operator | continue                                      | n/a                                            | day-5             | no                                 | no                                                                     |
| daily                          | day-6     | 2026-03-21        | Platform Pilot Operator | continue                                      | n/a                                            | day-6             | no                                 | no                                                                     |
| daily                          | day-7     | 2026-03-21        | Platform Pilot Operator | pause                                         | n/a                                            | day-7             | yes                                | no                                                                     |
| weekly                         | week-1    | 2026-03-21        | Platform Pilot Operator | pause                                         | n/a                                            | week-1            | yes                                | no                                                                     |
