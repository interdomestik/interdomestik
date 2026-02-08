## Pilot Purpose

Validate one closed-loop workflow in real branch operations in Kosovo:

`Member submits claim → Agent assists/follows up → Staff triages/updates → Admin monitors SLA drift and intervenes.`

## Scope

- In scope:
  - Member claims-first dashboard: empty + has-claims states.
  - Agent self member-dashboard overlay (session-derived `memberId`, fail-closed).
  - Agent My Members MVP with readiness marker `agent-members-ready`.
  - Staff claims queue MVP with `branch_manager` read-only policy.
  - Admin overview MVP (KPIs + breakdowns).
  - Deterministic seeds, gatekeeper, hardened E2E, Node 20 runtime guard.
- Out of scope:
  - New product features.
  - Routing/auth architecture changes (`apps/web/src/proxy.ts` remains authority).
  - RBAC/shell redesign.
  - Stripe/payment flows.

## Roles and Responsibilities

- Member: Submit claim and provide required supporting details promptly.
- Agent: First response, member guidance, follow-up, and clean handoff context.
- Staff: Triage queue, update claim status, maintain data correctness, meet SLAs.
- Admin: Monitor KPI/SLA drift, supervise escalations, decide continue/pause/rollback.

## Pilot Cohort

- 1 branch.
- 1 staff operator.
- 2 agents.
- 20–50 members.
- Pilot duration: 14 days (unchanged).

## SLA Targets

- Timezone and operating hours: `Europe/Pristina`, Monday–Sunday, `08:00–17:00`.
- Triage SLA: First staff triage within `4 operating hours` of claim submission.
- Update SLA: Member-visible update within `24 operating hours` after triage.
- Escalation SLA: Critical privacy/data/security issues escalated to Admin within `1 hour`.

## Operating Rhythm

- Daily ops huddle (15–20 min): Agent + Staff queue review, SLA risk, blockers.
- Daily end-of-day review (10 min): Admin checks KPI drift, incidents, action owners.
- Weekly review (45 min): Trend review, threshold check, go/no-go decision.
- Mon–Sun operations are active for the full 14-day pilot window.

## Weekend Operating Mode (Light-Touch)

- Coverage objective: During weekend operating hours (`08:00–17:00 Europe/Pristina`), monitor and log actively while avoiding non-critical change churn.
- Weekend scope (Saturday/Sunday, within defined operating hours):
  - Monitor guardrails, incidents, and SLA drift.
  - Log findings and ownership in the pilot incident log.
  - Apply hotfixes only for Sev1 issues that materially impact operating-hours SLAs.
- Weekend escalation:
  - Sev1 (privacy/tenant isolation/data integrity): immediate escalation and hotfix allowed.
  - Sev2/Sev3: log and defer to next weekday ops huddle unless a stop criterion is met or risk escalates to Sev1.

## Weekend Ceremony Checklist (Saturday/Sunday)

Run from repository root:

```bash
date -Is
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain
pnpm security:guard
```

- Record results in `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`.
- If Sev1 requires hotfix workflow evidence, run:
  - `./phase-5-1.sh`
  - Fallback: `bash ./phase-5-1.sh`
- Evidence bundle path convention for full gate runs:
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`
- If no full gate run is required, use `n/a` for bundle path in the evidence index row.

## Weekend Escalation Decision Table

| Condition                                                                 | Weekend Action                                      | Decision |
| ------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| Sev1 (privacy, tenant isolation, data integrity, or stop-criteria threat) | Immediate escalation + hotfix allowed               | `hotfix` |
| Sev2 (closed-loop break, major SLA breach) without Sev1 promotion         | Log, assign owner, defer to next weekday ops huddle | `defer`  |
| Sev3 (non-critical with workaround)                                       | Log, assign owner, defer to next weekday ops huddle | `defer`  |
| Any stop criterion reached                                                | Trigger rollback policy immediately                 | `stop`   |

## Incident Escalation

- Severity model:
  - Sev1: Privacy/tenant isolation/data integrity risk.
  - Sev2: Closed-loop workflow broken or major SLA breach.
  - Sev3: Non-critical regression with workaround.
- Escalation path: Agent/Staff on-call → Admin owner → Engineering lead.
- Communication target:
  - Sev1: Immediate and under 1 hour.
  - Sev2: Same operating day.
  - Sev3: Next scheduled daily review.

## Stop Criteria

Stop pilot immediately if any applies:

- Tenant isolation/privacy breach.
- Data integrity corruption (lost, duplicated, or cross-tenant claim data).
- Persistent `security:guard` failure.
- Repeated authentication/login failures for pilot users that block daily operations.
- Closed-loop workflow unavailable for more than one operating day.
- Triage/update SLA misses for 3 consecutive operating days.
- Persistent E2E contract failures after rollback attempt.

## Rollback Policy

- Maintain and verify a known-good pilot tag: `pilot-ready-YYYYMMDD`.
- On stop criteria:
  - Roll back deployment to latest pilot-ready tag.
  - Re-run readiness checks from `docs/pilot/COMMANDS_5.md` before resume decision.
