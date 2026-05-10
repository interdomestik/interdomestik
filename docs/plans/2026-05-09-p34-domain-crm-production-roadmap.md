---
plan_role: input
status: draft
source_of_truth: false
owner: platform + product + qa
last_reviewed: 2026-05-09
current_program_path: docs/plans/current-program.md
tracker_path: docs/plans/current-tracker.md
---

# P34 Domain CRM Production Roadmap

> Status: queued roadmap input after completed `P33-SEC12`. `P34` is pending activation through the tracker.

## Purpose

`P34` is the post-`P33-SEC12` CRM execution roadmap. It resumes CRM product work from the completed
`P32-CRM09 Member Support Handoff Reply` slice after completed `P33-SEC12 Commercial Action
Idempotency Tenant Scope Hardening`, without reopening the security hardening line.

This roadmap is queued as tracker input until `P34` is explicitly activated.

## Current Baseline

The repo already has production-facing CRM pieces, but they are distributed across route cores and
domain packages rather than a single `domain-crm` boundary:

- `/agent/crm`, `/agent/leads`, and `/agent/leads/[id]` provide the current agent CRM surfaces.
- `/member/help` and `/staff/support-handoffs` provide the support-handoff operating loop.
- `crm_leads`, `crm_activities`, `crm_deals`, `member_leads`, and `support_handoffs` are the current
  persistence primitives.
- `P32-CRM07` through `P32-CRM09` added public-response notifications, member acknowledgement, and
  bounded member reply semantics.
- `P33` hardened tenant isolation, DB access posture classification, storage access, signed URL
  exposure, build integrity, CI credentials, and Paddle/commercial action tenant scope.

## Execution Rule

New CRM behavior must go through `packages/domain-crm` once `P34-CRM-DG01` creates the boundary.
Existing route cores stay stable until a bounded slice explicitly moves one mature workflow behind
domain functions.

Every CRM domain function must accept explicit tenant and actor context from the route boundary.
`domain-crm` must not fetch ambient session state, bypass canonical routes, or reach into
`apps/web/src/proxy.ts`.

## P34 Sequence

### P34-CRM-DG01 Domain CRM Contract

Freeze the minimal contract before implementation:

- Create the `packages/domain-crm` skeleton only.
- Define `CrmActorContext` with explicit `tenantId`, `actorId`, `role`, and optional `branchId`.
- Define the support-handoff CRM state model, including staff-owned states and transition helpers.
- Decide that `staff_followed_up` is terminal for the bounded CRM10 reply cycle; a later slice must
  explicitly introduce multi-cycle conversation support before another member reply is allowed.
- Define `SupportHandoffRepository` as an interface before CRM10 implements behavior against it.
- Define a parameter-injected CRM notification port; `domain-crm` owns the decision to notify, and
  app/global notification infrastructure owns delivery.
- Define the timeline read-model invariant: timelines are derived/read-only projections, domain
  writes never write timeline rows directly, timeline may read aggregate repositories, and aggregates
  must not depend on timeline.
- Add focused pure tests for state and transition helpers.

### P34-CRM10 Staff Follow-Up After Member Reply

Build the next product slice from where `P32-CRM09` stopped:

- Staff queue exposes a "needs follow-up" attention state when a member reply exists.
- Staff can filter or identify handoffs needing follow-up on the existing `/staff/support-handoffs`
  surface.
- Staff follow-up clears the current attention state without introducing full conversation threads.
- The slice must include negative authorization tests for wrong tenant, wrong role, wrong branch or
  assignee where applicable, and no notification/attention side effects after failed authorization.

### P34-CRM11 Unified CRM Timeline Read Model

Normalize CRM timeline reads before migrating all writers:

- Add a domain-owned timeline read model for displaying lead, support-handoff, response,
  acknowledgement, and member-reply events.
- Keep timeline derived/read-only; do not rewrite all existing activity writers in one slice.
- Migrate activity-producing writes only when a later bounded slice touches that workflow.
- Include negative read-authorization tests for tenant and actor scope.

### P34-CRM12 Agent Follow-Up Workflow

Extend the same domain pattern to agent CRM:

- Add lead next-action/follow-up state through `domain-crm`.
- Surface due follow-ups on the agent CRM dashboard and lead detail where already present.
- Keep route components thin: resolve session/tenant, call domain functions, render.
- Prove agents cannot act on another tenant, branch, or agent-owned lead.

## Out Of Scope

`P34` does not authorize broad CRM redesign, broad SaaS redesign, agent-workspace redesign, route
renames, proxy edits, auth-layer collapse, tenancy architecture refactors, Stripe reintroduction,
full conversation threads, attachments, SLA timers, campaign automation, cron/NPS tenant-job
architecture, or a broad historical DB baseline burn-down.

## Production Readiness Gate

CRM cannot be called production-ready until:

- CRM mutations are behind explicit domain functions or explicitly classified wrappers.
- Each CRM mutation has same-PR negative authorization tests.
- CRM read models are tenant and actor scoped.
- Support-handoff and agent CRM flows have focused E2E gate coverage.
- Remaining CRM direct-DB exceptions are documented with owner, scope rationale, and follow-up
  decision.
