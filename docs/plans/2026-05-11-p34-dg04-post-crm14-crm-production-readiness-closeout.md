---
status: completed
date: 2026-05-11
slice: P34-DG04
title: Post-CRM14 CRM Production Readiness Closeout
owner: platform + product + qa
phase: Phase C
---

# P34-DG04 Post-CRM14 CRM Production Readiness Closeout

## Decision

`P34-DG04` closes the `P34 Domain CRM Production Roadmap` after completed `P34-CRM14`.

No new P34 implementation slice is promoted. No `P35` designation is opened by this gate. The
post-DG04 repo-canonical state is intentionally: P34 complete, with no active CRM implementation
slice pending from the P34 roadmap.

## Preconditions Verified

- PR `#715` landed `P34-CRM14 Agent Lead Mutation Domain Boundary`.
- Merge commit `0a3af52325e38341a383925bbf69b45d55ea5bd4` is present on `origin/main`.
- PR `#715` remote checks passed before merge: SonarCloud Quality Gate, PR finalizer, unit, static,
  full PR E2E, e2e-gate, Pilot Gate Runner, pilot-gate, audit, gitleaks, pnpm-audit, commitlint,
  validation-surface, and Vercel ignored-build status.
- The external Notion program tracker was synced after PR `#715` merged.

## Closeout Review

DG04 reviewed the P34 roadmap exit criteria and the remaining CRM direct-DB exceptions. P34 closes
because the remaining exceptions are exactly the classified set below, and each is either behind a
domain adapter/read-model boundary or explicitly outside P34 scope.

### Classified Remaining Exceptions

- `apps/web/src/lib/domain-crm/*-repository.ts` DB calls are allowed infrastructure adapters behind
  `domain-crm` interfaces. They are the app-owned persistence boundary for domain functions, not new
  route-local CRM logic.
- Agent CRM dashboard and lead-detail read-model queries remain tenant and actor scoped. P34 moved
  mature writes and readiness-gate coverage behind `domain-crm`; it did not require every CRM read
  model query to be migrated in the same roadmap.
- `memberLeads` acquisition, verification, admin, branch, and workspace flows are explicitly outside
  the `crm_leads` agent CRM mutation boundary addressed by CRM14. They stay future work only if a
  later gate promotes them.
- `packages/domain-activities/src/log-lead.ts` is a legacy activity writer that predates P34 and
  does not mutate agent CRM lead state. No P34 gate required migrating it, so it is not a P34 blocker
  unless a later bounded gate promotes it.

If a later review finds a CRM direct-DB exception outside this classified set, that review must
promote a bounded follow-up slice rather than retroactively widening P34.

## Completed P34 Scope

- `P34-CRM-DG01` created the minimal `packages/domain-crm` contract, explicit actor context,
  support-handoff aggregate/state helpers, notification port interface, repository interfaces, and
  timeline read-model invariant.
- `P34-CRM10` routed support-handoff staff follow-up after member reply through `domain-crm`.
- `P34-CRM11` added the derived/read-only CRM timeline read model.
- `P34-CRM12` routed agent lead follow-up scheduling and completion through `domain-crm`.
- `P34-DG02` selected the remaining CRM E2E gate coverage slice.
- `P34-CRM13` added blocking gate coverage for the agent CRM follow-up workflow and fixed the
  `gate-mk-contract` PR-gate matrix gap.
- `P34-DG03` selected CRM14 as the final mutation-boundary readiness slice.
- `P34-CRM14` routed create lead, update lead stage, and record lead activity through explicit
  `domain-crm` functions with tenant, role, branch, and agent ownership authorization.

## Non-Goals

- No product runtime behavior changes.
- No proxy changes.
- No canonical route changes.
- No auth or tenancy architecture changes.
- No schema or migration changes.
- No Stripe changes.
- No broad CRM redesign, broad SaaS redesign, agent-workspace redesign, full conversation threads,
  attachments, SLA timers, campaign automation, cron/NPS tenant-job architecture, broad DB baseline
  burn-down, README, AGENTS, or architecture-doc changes.

## Verification

- `git log --oneline origin/main | rg "0a3af523|0a3af52"`
- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `interdomestik_qa.scope_audit` with changes limited to `docs/plans/**`
