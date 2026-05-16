# P38-DG22 CRM23 And CRM Foundation Closeout

Status: complete
Slice: `P38-DG22`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-16
Authority: completed closeout gate. This document closes `P38-CRM23` and the current `P38` CRM
foundation tranche. It promotes no implementation slice.

Status vocabulary: `complete` records a completed design/closeout gate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

## Status / Predecessor Closeout

`P38-CRM23 Controlled Routing Application Service` is complete through PR `#793`, merge commit
`6674b0e022a6e8b0d828826b40ef49fbb62d8151`.

CRM23 shipped the DG21-promoted service boundary:

- pure SQL-free `applyCrmLeadRoutingDecision` under `packages/domain-crm/src/routing/`;
- app-side coordinator `apps/web/src/lib/domain-crm/routing-application-service.ts`;
- composition of CRM07 routing selection, CRM08 routing persistence, CRM lead ownership transfer,
  assignment audit append, and `crm.lead.routed` outbox append;
- tenant/branch authorization, idempotent replay, cursor-conflict retry, stale-lead handling,
  rollback semantics, PII-safe typed outcomes, and no-write failure paths;
- focused domain and app tests for replay, conflict, authorization, stale lead, audit, ownership,
  outbox, and rollback behavior.

The PR also stabilized two existing gate surfaces that blocked required proof: the CRM09 routing-rule
gate now waits for durable DB state and refreshes the UI after action completion, and the staff
support-handoff advisory test scopes duplicate transitional member surfaces before asserting the
generic advisory marker.

Local proof included `git diff --check`, focused domain/web tests, web/domain type-check, web lint,
focused E2E for admin CRM routing plus staff support handoffs, `pnpm security:guard`,
`pnpm ci:local:quick`, and host `pnpm pr:verify`. Docker `ci:local:pr` / full remained blocked in
this workspace by repeated exit `137` during the Next TypeScript build. Remote proof passed:
SonarCloud with `0` new issues, audit, validation-surface, unit, static, full PR E2E, e2e-gate,
Pilot Gate Preflight, Pilot Gate Runner, pilot-gate, commitlint, gitleaks, pnpm-audit,
pr-finalizer, Vercel Preview Comments, and ignored Vercel deployment status. Copilot review threads
were fixed and resolved before merge. The feature branch was deleted after merge.

## P38 Foundation Completion Decision

DG21 set the P38 CRM Foundation completion bar. CRM23 satisfies the final routing condition, and the
current tranche is closed:

- Lead, account, contact, and deal foundations exist through CRM01, CRM02, CRM03, CRM04, CRM06, CRM07,
  CRM08, CRM09, and CRM23.
- Pipeline, reporting, and forecasting surfaces are usable through CRM04, CRM05, CRM12, CRM13, CRM14,
  CRM15, CRM16, CRM17, CRM18, CRM19, CRM20, CRM21, and CRM22.
- Routing rules can be managed through CRM09 and applied through CRM23's controlled service boundary.
- Legacy deal cleanup and nullability risks remain explicitly deferred: `P38-CRM10` Legacy Deal
  Column Retirement and `P38-CRM11` Deal Nullability Tightening require separate parity, zero-null,
  quarantine, and backfill proof before promotion.
- Tasks, templates, sequences, scoring, consent, routing audit retention, automated routing triggers,
  external notification fanout, and broader CRM workflow expansion are moved to a later program unless
  a future repo-canonical gate proves they are required for pilot operation.

## Decision

Close `P38 CRM State-Of-The-Art Foundations`.

Promote no next `P38` implementation slice. Any future CRM work must start from a new repo-canonical
program or a narrowly justified pilot blocker, and must preserve Phase C constraints unless a later
approved design gate explicitly changes them.

## Repo-Size Budget

This closeout adds one tracked design record and updates `scripts/repo-size-budget.json` only to
raise the tracked-file ceiling from `3,710` to `3,711`. No other budget is expanded.

## Boundaries Preserved

This closeout does not authorize or perform:

- `apps/web/src/proxy.ts` changes;
- canonical route renames or bypasses;
- auth/session layering, tenancy architecture, routing architecture, or domain architecture refactors;
- Stripe reintroduction;
- README, AGENTS.md, or broad architecture-doc edits;
- automatic routing on lead creation, cron, campaign automation, webhook wiring, public/member/agent/
  staff/admin route callers for CRM23, or UI controls for routing application.
