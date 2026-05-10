---
status: completed
date: 2026-05-10
slice: P34-DG03
title: Post-CRM13 CRM Production Readiness Selection
owner: platform + product + qa
phase: Phase C
---

# P34-DG03 Post-CRM13 CRM Production Readiness Selection

## Decision

`P34-DG03` closes the post-`P34-CRM13` readiness review and promotes exactly one bounded
implementation slice:

`P34-CRM14 Agent Lead Mutation Domain Boundary`

CRM12 moved agent lead follow-up scheduling and completion behind `packages/domain-crm`. CRM14 moves
the remaining core agent CRM lead writes behind the same boundary without changing product behavior,
routes, auth, tenancy, schema, or UI.

## Promoted Scope

CRM14 migrates these existing agent CRM write cores into thin domain delegators:

- `apps/web/src/lib/actions/agent/create-lead.core.ts`
- `apps/web/src/lib/actions/agent/update-lead-status.core.ts`
- `apps/web/src/lib/actions/agent/log-activity.core.ts`

The operation name is `updateCrmLeadStage`, not status. The existing file name remains unchanged for
route compatibility, but the domain contract uses `stage` because `crm_leads.stage` is the persisted
pipeline field.

`logActivity` becomes `recordCrmLeadActivity` in `domain-crm`. It writes to `crm_activities`, the
write-side event source that the CRM11 timeline read model can project from. Domain writes must not
write timeline rows directly.

## Required Implementation Details

- Add domain lead mutation contracts/functions for create lead, update lead stage, and record lead
  activity.
- Keep `CrmActorContext` explicit. `domain-crm` must not fetch ambient session state.
- Keep the three `.core.ts` files as thin wrappers that receive/resolve actor context from the
  action layer, call domain functions, and translate existing return shapes.
- Implement the app DB repository under `apps/web/src/lib/domain-crm`.
- Enforce agent ownership in `domain-crm`: `actorId` must match the lead's assigned `agentId`.
- For existing-lead mutations, enforce tenant, role, agent ownership, and branch scope before writes.
- Suppress all writes and notification-port calls after failed authorization.
- Preserve existing redirects, routes, clarity markers, schema, and UI behavior.

## Required Negative Tests

Same-PR tests must prove:

- wrong `tenantId` is rejected;
- wrong `role` is rejected;
- wrong agent ownership is rejected for existing-lead mutations;
- wrong branch is rejected where branch scope applies;
- DB writes and notification calls are suppressed on authorization failure.

## Remaining Direct-DB Exceptions

CRM14 is expected to eliminate direct agent CRM writes from the three listed write cores. It does not
eliminate these known exceptions:

- agent CRM dashboard and lead detail read-model queries;
- `apps/web/src/lib/domain-crm/*-repository.ts` DB adapters, which are allowed infrastructure
  adapters behind domain interfaces;
- `memberLeads` acquisition, verification, admin, branch, and workspace surfaces, which are not the
  `crm_leads` agent CRM mutation boundary addressed by this slice.

## Non-Goals

- No `/agent/crm` redesign.
- No support-handoff behavior changes.
- No schema or migration.
- No broad `memberLeads` migration.
- No new routes, proxy edits, auth refactors, tenancy refactors, Stripe, full conversation threads,
  SLA timers, campaigns, cron/NPS architecture, README, AGENTS, or architecture-doc changes.

## Verification Plan

- `pnpm --filter @interdomestik/domain-crm test:unit`
- focused web unit tests for agent actions and app repositories
- `pnpm verify-slice -- --static`
- diff-scoped Codex Security plugin `security-scan`
- `pnpm verify-slice -- --required-gates`
- `git diff --check`
- plan/tracker/docs audits for the promotion records
