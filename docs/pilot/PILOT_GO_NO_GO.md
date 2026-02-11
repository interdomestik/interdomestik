## Pilot Entry Criteria v1.0

- Release gate green on production: `pnpm release:gate:prod` exits `0`, and a new `docs/release-gates/YYYY-MM-DD_production_<dpl>.md` report is generated and committed.
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

- Execute full `./scripts/pilot-verify.sh` successfully.
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

## Go/No-Go Thresholds

- Go:
  - All 5 canonical readiness commands pass.
  - No Sev1 incidents.
  - SLA compliance meets thresholds for week 1.
  - Closed-loop path operational end-to-end.
- No-Go:
  - Any Sev1 incident unresolved.
  - When stop criteria are met, they trigger an immediate stop/rollback decision; weekend defer policy cannot override or delay this.
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
- Resume only after full re-validation with `./scripts/pilot-verify.sh`.
