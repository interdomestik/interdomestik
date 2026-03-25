## Pilot Entry Criteria v1.0

- Local pre-launch readiness is green: `pnpm pilot:check` exits `0`.
- Readiness cadence proof is green when the active pilot id already has 3 consecutive qualifying green operating days recorded and `pnpm pilot:cadence:check -- --pilotId <pilot-id>` exits `0`.
- Release gate green on production: `pnpm release:gate:prod -- --pilotId <pilot-id>` exits `0`.
- Rollback target and resume rules use a real `pilot-ready-YYYYMMDD` tag created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.
- The canonical pilot-entry artifact set defined in `docs/pilot/PILOT_RUNBOOK.md` exists and is committed:
  - a new `docs/release-gates/YYYY-MM-DD_production_<dpl>.md` report
  - the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
  - the canonical pointer row in `docs/pilot-evidence/index.csv`
- Daily pilot evidence is recorded in the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file via `pnpm pilot:evidence:record -- --pilotId <pilot-id>`.
- Add the remaining required flags (`--day`, `--date`, `--owner`, `--status`, `--incidentCount`, `--highestSeverity`, `--decision`, and `--bundlePath`) when recording the row.
- Observability evidence is recorded in that same copied evidence index via `pnpm pilot:observability:record -- --pilotId <pilot-id>`.
- Observability rows must capture log-sweep result, KPI condition, incident count, and highest severity before the corresponding decision row is written.
- Daily and weekly continue/pause/hotfix/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`.
- Decision rows must reference the matching observability window through `Observability Ref`.
- Operational control-plane works: admin role assignment/removal succeeds in KS tenant and reflects in UI; cross-tenant admin access remains blocked (MK -> KS).
- Member evidence is reliable: upload persists after refresh and relogin; uploaded file download/open works.
- Staff workflow persistence is reliable: status update persists and note persists after refresh at `data-testid="staff-claim-detail-note"`.
- Observability is quiet enough: a bounded live sample from `vercel logs <deployment-url-or-id> --json` shows no functional errors for the current production deployment; expected authorization-deny noise from negative tests is acceptable.

## Pre-Launch Checks

- Runtime: Node `20.x` verified.
- Required envs present: `DATABASE_URL`, `BETTER_AUTH_SECRET`.
- Deterministic seed baseline validated.
- `pnpm pr:verify` passes.
- `pnpm security:guard` passes.
- `bash scripts/m4-gatekeeper.sh` passes.
- `pnpm e2e:gate` passes.
- Pilot users and roles provisioned for one branch.
- Escalation contacts confirmed (Agent, Staff, Admin, Engineering).

## Launch-Day Checks

- Execute `pnpm pilot:check` successfully.
- Do not require `pnpm pilot:cadence:check -- --pilotId <pilot-id>` on the literal Day 1 launch of a new pilot id. Use it only after the active pilot id has enough recorded qualifying days to prove the readiness streak.
- Execute `pnpm release:gate:prod -- --pilotId <pilot-id>` successfully.
- Start the copied pilot evidence index and record day 1 through `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`.
- Record the day-1 observability row in that same copied evidence index through `pnpm pilot:observability:record -- --pilotId <pilot-id> --reference day-1 ...`.
- Record the launch-day decision row in that same copied evidence index through `pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType daily --reference day-1 ...`.
- Perform one end-to-end closed-loop claim walkthrough.
- Confirm `agent-members-ready` visible in Agent My Members.
- Confirm Staff queue policy behavior (`branch_manager` read-only).
- Confirm Admin overview KPIs and breakdowns load for pilot branch.
- Start incident log and SLA tracking clock in `Europe/Pristina`.
- Confirm reset-gate learning retrievals were reviewed and that the intended pilot triggers were the top hits.

## Day-7 Rehearsal Checks

- Triage SLA (≤ 4 operating hours) on at least `90%` of claims.
- Update SLA (≤ 24 operating hours post-triage) on at least `90%` of claims.
- No unresolved Sev1/Sev2 older than one operating day.
- `pnpm e2e:gate` pass rate `100%` (or immediate corrective action).
- `pnpm security:guard` pass rate `100%`.
- Day 7 executive review records a clear final recommendation with owners.
- Day 7 records a repo-backed observability row that captures log-sweep result, KPI condition, and highest incident severity.
- Day 7 records a repo-backed decision-proof row with the matching observability reference and rollback target when applicable.
- Day 7 creates `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md` from the canonical template.

## Go/No-Go Thresholds

- Go:
  - `pnpm pilot:check` passes.
  - `pnpm release:gate:prod -- --pilotId <pilot-id>` passes and produces the canonical artifact set.
  - Latest observability evidence is `clear` or `expected-noise`, KPI condition is `within-threshold`, and no Sev1 incidents are present.
  - No Sev1 incidents.
  - SLA compliance meets the 7-day rehearsal thresholds.
  - Closed-loop path operational end-to-end.
- No-Go:
  - Latest observability evidence is `action-required`.
  - KPI condition is `breach` without an accepted stop-or-hotfix decision.
  - Any Sev1 incident unresolved.
  - When stop criteria are met, they trigger an immediate stop/rollback decision; weekend pause policy cannot override or delay this.
  - Repeated guardrail failures (`security:guard`, `m4-gatekeeper.sh`, or `e2e:gate`) without fix.
  - Repeated authentication/login failures for pilot users that block operations.
  - Closed-loop path broken for more than 1 operating day.
  - SLA misses exceed threshold for 3 consecutive operating days.

## Post-Cadence Decision Rule

After `pnpm pilot:cadence:check -- --pilotId <pilot-id>` exits `0` on the active process-proof pilot id:

- default decision: formal process-proof closeout
- do not continue operating days by inertia
- do not treat cadence pass alone as expansion approval
- bounded continuation is allowed only when a refreshed executive review states:
  - the narrow continuation objective
  - the explicit stop date or end condition
  - why closeout is not yet sufficient
  - why expansion remains `no`

For the current process-proof authority line, a cadence pass proves the missing multi-day operating streak and closes the original repeat-for-cadence gap. That should end the proof loop unless a new bounded continuation decision is written explicitly.

## Stop the Pilot If

- Any privacy or tenant-isolation breach occurs.
- Any data integrity issue occurs (loss, duplication, or cross-tenant leakage).
- Security guardrails fail persistently.
- Repeated authentication/login failures block pilot operations.
- Contract E2E fails persist after rollback.
- Operational risk exceeds safe recovery within one operating day.

## Rollback Decision Rule

- Trigger rollback immediately on stop criteria.
- Rollback target: latest `pilot-ready-YYYYMMDD` git tag.
- Create or verify that rollback target through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` so it stays bound to the canonical pilot-entry report and copied evidence index.
- Resume only after fresh `pnpm pilot:check` re-validation and a new `pnpm release:gate:prod -- --pilotId <pilot-id>` artifact row, followed by `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>` for the resumed date.
- Record stop or hotfix decisions in the copied evidence index with `pnpm pilot:decision:record -- --rollbackTag pilot-ready-YYYYMMDD`.
