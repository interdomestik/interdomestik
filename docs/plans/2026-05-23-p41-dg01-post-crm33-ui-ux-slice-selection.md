# P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate

Status: complete
Slice: `P41-DG01`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-23
Authority: approved design gate. This gate promotes the next bounded product UI/UX slice after
`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                          |
| -------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-23 | Initial review draft after `P40-CRM33` merged through PR `#852`.                               |
| `r2`     | 2026-05-23 | Sonnet 4.6 hardening for row-by-row P40/P41 promotion state and unconditional repo-size proof. |

## Definitions

- Post-CRM UI/UX slice: a bounded product-quality slice selected after the P40 CRM task queue
  tranche, focused on existing canonical user-facing surfaces rather than new CRM runtime
  capability.
- Product surface UX audit: a docs-and-evidence slice that reviews existing canonical surfaces,
  records concrete UX issues, ranks the next implementation candidates, and promotes at most one
  narrow follow-up implementation recommendation for a later gate.
- Canonical surface: an existing public, member, agent, staff, or admin route reachable through the
  current Phase C route map and guarded by `apps/web/src/proxy.ts`.
- Runtime UI implementation: changes to route code, components, messages, tests, database reads,
  actions, server actions, or E2E behavior. This review draft does not authorize runtime
  implementation.
- Broad redesign: a route architecture rewrite, design-system overhaul, visual rebrand,
  information-architecture reset, new portal shell, new dashboard family, or cross-role
  navigation redesign. Broad redesign is not promoted by this gate.

## Predecessor Dependency

`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls` is the direct predecessor.

Predecessor proof:

- `P40-DG10 CRM Task Queue Priority Adjustment Controls Design Gate` is recorded in
  `docs/plans/2026-05-23-p40-dg10-crm-task-priority-controls-design.md`.
- `P40-DG10A CRM33 Priority History Constraint Hardening Decision` is recorded in
  `docs/plans/2026-05-23-p40-dg10a-crm33-priority-history-constraint-hardening.md`.
- `P40-CRM33` merged as PR `#852`, merge commit
  `722576e12ca7d993174aff51f2b95375cde7bd86`, on 2026-05-23.
- PR `#852` added the DG10-approved narrow CRM task priority mutation foundation, row-local
  priority controls for existing visible, assigned, open, lead-backed `/agent/crm` task queue rows,
  and the DG10A-authorized minimum `crm_task_history` constraint widening for `priority_updated`
  and `manual_priority_change`.
- PR `#852` preserved Start/Complete controls, due-date controls, cancellation controls,
  completed-task recovery controls, lead links, queue markers, legacy due-follow-up separation,
  canonical routes, and `apps/web/src/proxy.ts`.
- The CRM task queue now has completed the P40 progression from persistence and runtime boundary
  through open queue rendering, lifecycle controls, due-date controls, cancellation, completed-task
  recovery, and priority adjustment. No further CRM implementation slice is promoted by this
  review draft.

This promotion records the CRM33 closeout in `docs/plans/current-program.md` and
`docs/plans/current-tracker.md`, closes the P40 CRM Product Depth tranche, and promotes only the
bounded P41 slice selected here.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- P40 CRM product-depth gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`,
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`,
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`,
  `docs/plans/2026-05-22-p40-dg06-crm-task-queue-lifecycle-controls-design.md`,
  `docs/plans/2026-05-22-p40-dg07-crm-task-queue-due-date-controls-design.md`,
  `docs/plans/2026-05-22-p40-dg08-crm-task-cancellation-controls-design.md`,
  `docs/plans/2026-05-22-p40-dg09-crm-task-completed-recovery-design.md`,
  `docs/plans/2026-05-23-p40-dg10-crm-task-priority-controls-design.md`, and
  `docs/plans/2026-05-23-p40-dg10a-crm33-priority-history-constraint-hardening.md`.
- Prior product UI/UX precedent:
  `P18` Pilot-Learned Trust And Activation UX,
  `P23` Live Product Responsiveness,
  `P25` Commercial Product Surface Polish,
  `P26` through `P30` bounded product and risk-reduction tranches.
- Canonical route constraints and clarity markers enforced by Phase C E2E gates.

Codebase and tracker verification as of this gate:

- Pre-promotion `docs/plans/current-tracker.md` recorded `P40-CRM33` as `pending`; this promotion
  updates that row to `completed` using PR `#852` and merge commit
  `722576e12ca7d993174aff51f2b95375cde7bd86`.
- Existing program history explicitly keeps CRM redesign, agent-workspace redesign, product
  analytics expansion, and broad SaaS redesign unpromoted unless a later bounded design gate
  authorizes a specific slice.
- P40 delivered the CRM task queue depth series. The next useful step is not another CRM feature by
  default; it is a product-surface UX evidence pass that ranks where the next narrow implementation
  effort should land.

## Decision

Propose exactly one next slice:

`P41-UX01 Product Surface UX Audit And Slice Ranking`

The promoted slice is a docs-and-evidence design slice. It reviews existing canonical public,
member, agent, staff, and admin surfaces after P40, records concrete UX and workflow issues, ranks
the next bounded implementation candidates, and recommends at most one follow-up implementation
slice for a later promotion gate. It does not directly edit runtime UI, route code, auth, tenancy,
schemas, or product behavior.

## Candidate Ranking

| Rank | Candidate                                             | Decision | Rationale                                                                                                                                                                                            |
| ---- | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P41-UX01 Product Surface UX Audit And Slice Ranking` | Propose  | After the CRM task queue tranche, the repo needs evidence-driven product prioritization before another UI implementation. This keeps the next move professional, bounded, and reviewable.            |
| 2    | Agent CRM task queue density polish                   | Defer    | CRM28 through CRM33 added several row-local controls. Density and mobile ergonomics are plausible risks, but they should be ranked against other product surfaces before another CRM-specific slice. |
| 3    | Member dashboard or claim-detail trust polish         | Defer    | P18 and P30 already addressed bounded member trust and claim-detail clarity. Additional work should be justified by current evidence rather than assumed.                                            |
| 4    | Public commercial entry follow-up                     | Defer    | P25 polished the public commercial entry path. A follow-up may be useful, but the audit should first compare it against authenticated workflow needs.                                                |
| 5    | Agent workspace redesign                              | Defer    | Prior program notes explicitly require a later repo-canonical design gate before agent-workspace redesign. This draft does not authorize redesign.                                                   |
| 6    | Cross-role navigation or portal shell redesign        | Reject   | This is broad route and information-architecture work and conflicts with Phase C constraints unless separately scoped and justified.                                                                 |
| 7    | Product analytics expansion                           | Defer    | Measurement may be an audit recommendation, but this gate does not promote instrumentation, dashboards, or analytics schema changes.                                                                 |
| 8    | Additional CRM runtime capability                     | Defer    | No remaining CRM implementation slice is currently promoted. New CRM behavior should wait for explicit evidence and a separate design gate.                                                          |

## Proposed P41-UX01 Scope

Authorized scope for P41-UX01:

- Review the existing canonical public, member, agent, staff, and admin surfaces using repo-visible
  code, current tracker/program records, existing E2E clarity markers, and available screenshots or
  local browser evidence.
- Evaluate surfaces against:
  - first-viewport clarity and task orientation;
  - workflow density and repeated-use efficiency;
  - mobile wrapping, tab order, and horizontal-scroll risk;
  - accessibility basics, including focus behavior, keyboard reachability, landmark structure, and
    accessible names for compact controls;
  - locale-copy completeness and risk of English fall-through on newly visible product actions;
  - operational trust, state visibility, loading and pending feedback, and error recoverability;
  - visual consistency across canonical role surfaces.
- Produce a ranked list of bounded implementation candidates with scope, non-goals, affected
  routes, likely files, verification expectations, and Phase C risk posture.
- Recommend at most one next implementation slice for a later promotion gate.
- Include a model-review packet when available:
  - use a cost-conscious architecture reviewer for coupling and feasibility;
  - use a design/product reviewer for UX, mobile, and accessibility critique;
  - reserve higher-cost or escalation reviewers for genuine disagreement or high-risk scope.
- Keep the audit evidence non-PII. Screenshots, snippets, and examples must avoid customer notes,
  claim narratives, medical/legal facts, insurer correspondence, phone numbers, emails, and raw
  support content.

Expected outputs:

- A P41-UX01 audit document under `docs/plans/`.
- A ranked candidate table with explicit acceptance and rejection reasons.
- A proposed next implementation slice, or an explicit no-implementation recommendation if the
  evidence does not justify a safe bounded slice.
- No runtime code changes.

## Scope Boundaries

P41-UX01 may inspect route code and tests, but it must not edit runtime files.

Authorized files for a later P41-UX01 audit PR should be limited to:

- `docs/plans/**`;
- `docs/release-gates/**` only if existing release-gate evidence is summarized or linked;
- tracker/program updates needed to record P40 closeout and P41 promotion.

Unauthorized changes:

- `apps/web/src/proxy.ts`;
- route groups, route aliases, canonical route names, middleware, auth/session layering, tenancy
  boundaries, or broad navigation architecture;
- runtime UI components, pages, actions, server actions, API routes, cron routes, database schema,
  migrations, RLS, adapters, repositories, domain packages, tests, messages, Stripe, README,
  `AGENTS.md`, or architecture docs.

If review concludes runtime UI evidence must be gathered with a local browser, that validation
must be observational only. Any runtime fix must be promoted as a separate bounded implementation
slice after P41-UX01.

## Review Method

P41-UX01 should use a small reviewer pool, not a large committee.

Recommended review lanes:

- Product/design lane: inspect visual hierarchy, mobile density, workflow clarity, empty/loading
  states, and role-specific task orientation.
- Platform lane: identify coupling, route constraints, data dependencies, test seams, and whether
  a proposed implementation can stay within Phase C.
- Accessibility/QA lane: check keyboard reachability, focus movement, screen-reader labels,
  stable E2E markers, and likely proof commands.
- Fast consistency lane: check contradictions, stale tracker references, missing non-goals,
  acceptance criteria gaps, and verification-plan completeness.

Use higher-cost escalation review only when the small reviewer pool disagrees on a high-risk
architecture, auth, tenancy, schema, RLS, or route-boundary question.

## Acceptance Criteria

- `P40-CRM33` is recorded as completed in `current-program.md` and `current-tracker.md` before
  this gate is promoted, using PR `#852` and merge commit
  `722576e12ca7d993174aff51f2b95375cde7bd86`.
- DG01 promotes only `P41-UX01 Product Surface UX Audit And Slice Ranking`.
- P41-UX01 is docs-and-evidence only and does not authorize runtime UI edits.
- The audit covers existing canonical public, member, agent, staff, and admin surfaces at a level
  sufficient to rank the next bounded implementation candidate.
- The audit records concrete evidence, affected routes, likely ownership, Phase C risks, and
  verification expectations for each high-ranking candidate.
- Any recommended implementation slice remains narrow, route-canonical, and compatible with
  `apps/web/src/proxy.ts` as the routing and access-control authority.
- No CRM runtime behavior, additional task-management feature, new route, auth/tenancy/routing
  refactor, schema/RLS/migration, Stripe, README, `AGENTS.md`, or broad architecture-doc change is
  included.

## Sonnet 4.6 Design Review Proof

Mandatory architecture/scope review ran through the callable Copilot Sonnet route:
`copilot -p "<minimized non-PII design packet>" --model claude-sonnet-4.6 --available-tools=""
--disable-builtin-mcps --no-custom-instructions --no-color --silent`.

Review result:

- Verdict: Ready with hardening.
- Blockers: None.
- Required hardening applied in `r2`:
  - §Program/Tracker Promotion State now enumerates every current-program and current-tracker
    transition required to close P40 and promote P41.
  - §Verification Proof now requires `pnpm repo:size:check` unconditionally for the promotion PR.

## Verification Proof For This Design Gate

Before opening a promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;

If the active worktree cannot resolve dependencies, report the exact blocker and run the strongest
available docs/tracker fallback from a dependency-ready checkout.

## Program/Tracker Promotion State

This promotion records the following repo-canonical state:

- `docs/plans/current-program.md`: update the P40 CRM Product Depth paragraph from open to
  complete, append the `P40-CRM33` closeout proof with PR `#852` and merge commit
  `722576e12ca7d993174aff51f2b95375cde7bd86`, and add the P41 design-gate paragraph promoting
  exactly `P41-UX01 Product Surface UX Audit And Slice Ranking`.
- `docs/plans/current-program.md`: add a program goal preserving P40 as complete and opening P41
  as a docs-and-evidence product UI/UX audit tranche.
- `docs/plans/current-tracker.md`: move the top-level `P40` row from `in_progress` to `completed`
  with the CRM24 through CRM33 closeout summary.
- `docs/plans/current-tracker.md`: move `P40-CRM33` from `pending` to `completed` with PR `#852`,
  merge commit `722576e12ca7d993174aff51f2b95375cde7bd86`, local/remote proof summary, and the
  preserved Phase C exclusions.
- `docs/plans/current-tracker.md`: add a `P41` row with status `in_progress` for Product Surface
  UX Professionalism after P40.
- `docs/plans/current-tracker.md`: add a `P41-DG01` row with status `completed` for this gate.
- `docs/plans/current-tracker.md`: add a `P41-UX01` row with status `pending` for the promoted
  docs-and-evidence audit slice.
- `docs/plans/current-tracker.md`: add proof-table rows for `P40-CRM33`, `P41`, `P41-DG01`, and
  `P41-UX01` with target statuses `pass`, `not_applicable`, or `pending` matching their lifecycle.
- Promotion changes stay scoped to docs/plans, tracker/program proof, and repo-size budget.

## Completion State

| Item                                                          | Status   | Evidence                                                            |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls` | merged   | PR `#852`, merge commit `722576e12ca7d993174aff51f2b95375cde7bd86`. |
| `P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate`       | complete | This document; promoted after Sonnet 4.6 hardening.                 |
| `P41-UX01 Product Surface UX Audit And Slice Ranking`         | promoted | Sole next slice authorized by this gate.                            |

## Final Decision For Review

This gate promotes exactly one next slice:

`P41-UX01 Product Surface UX Audit And Slice Ranking`

Runtime implementation is not authorized by this gate. P41-UX01 is a docs-and-evidence audit slice
and may begin after this promotion is merged and recorded in the repo-canonical program/tracker.
