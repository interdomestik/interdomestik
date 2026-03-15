## Pilot Entry Criteria v1.0

- Local pre-launch readiness is green: `pnpm pilot:check` exits `0`.
- Release gate green on production: `pnpm release:gate:prod -- --pilotId <pilot-id>` exits `0`.
- Rollback target and resume rules use a real `pilot-ready-YYYYMMDD` tag created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.
- The canonical pilot-entry artifact set defined in `docs/pilot/PILOT_RUNBOOK.md` exists and is committed:
  - a new `docs/release-gates/YYYY-MM-DD_production_<dpl>.md` report
  - the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md`
  - the canonical pointer row in `docs/pilot-evidence/index.csv`
- Daily pilot evidence is recorded in the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file via `pnpm pilot:evidence:record -- --pilotId <pilot-id>`.
- Add the remaining required flags (`--day`, `--date`, `--owner`, `--status`, `--incidentCount`, `--highestSeverity`, `--decision`, and `--bundlePath`) when recording the row.
- Daily and weekly continue/pause/hotfix/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`.
- Operational control-plane works: admin role assignment/removal succeeds in KS tenant and reflects in UI; cross-tenant admin access remains blocked (MK -> KS).
- Member evidence is reliable: upload persists after refresh and relogin; uploaded file download/open works.
- Staff workflow persistence is reliable: status update persists and note persists after refresh at `data-testid="staff-claim-detail-note"`.
- Observability is quiet enough: `vercel logs --environment production --since 60m --no-branch --level error` has no functional errors; expected authorization-deny noise from negative tests is acceptable.

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
- Execute `pnpm release:gate:prod -- --pilotId <pilot-id>` successfully.
- Start the copied pilot evidence index and record day 1 through `pnpm pilot:evidence:record -- --pilotId <pilot-id> ...`.
- Record the launch-day decision row in that same copied evidence index through `pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType daily --reference day-1 ...`.
- Perform one end-to-end closed-loop claim walkthrough.
- Confirm `agent-members-ready` visible in Agent My Members.
- Confirm Staff queue policy behavior (`branch_manager` read-only).
- Confirm Admin overview KPIs and breakdowns load for pilot branch.
- Start incident log and SLA tracking clock in `Europe/Pristina`.

## Week-1 Checks

- Triage SLA (≤ 4 operating hours) on at least `90%` of claims.
- Update SLA (≤ 24 operating hours post-triage) on at least `90%` of claims.
- No unresolved Sev1/Sev2 older than one operating day.
- `pnpm e2e:gate` pass rate `100%` (or immediate corrective action).
- `pnpm security:guard` pass rate `100%`.
- Weekly review records clear continue/pause decision with owners.
- Weekly review records a repo-backed decision-proof row with rollback target when applicable.

## Go/No-Go Thresholds

- Go:
  - `pnpm pilot:check` passes.
  - `pnpm release:gate:prod -- --pilotId <pilot-id>` passes and produces the canonical artifact set.
  - No Sev1 incidents.
  - SLA compliance meets thresholds for week 1.
  - Closed-loop path operational end-to-end.
- No-Go:
  - Any Sev1 incident unresolved.
  - When stop criteria are met, they trigger an immediate stop/rollback decision; weekend pause policy cannot override or delay this.
  - Repeated guardrail failures (`security:guard`, `m4-gatekeeper.sh`, or `e2e:gate`) without fix.
  - Repeated authentication/login failures for pilot users that block operations.
  - Closed-loop path broken for more than 1 operating day.
  - SLA misses exceed threshold for 3 consecutive operating days.

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
