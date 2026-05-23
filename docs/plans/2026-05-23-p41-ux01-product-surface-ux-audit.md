# P41-UX01 Product Surface UX Audit And Slice Ranking

Status: complete
Slice: `P41-UX01`
Owner: platform + product + design + qa
Phase: Phase C
Date: 2026-05-23
Authority: completed docs-and-evidence audit under
`P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this audit.

## Revision History

| Revision | Date       | Notes                                                                                            |
| -------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `r1`     | 2026-05-23 | Initial product-surface audit after `P41-DG01` promoted `P41-UX01`.                              |
| `r2`     | 2026-05-23 | Gemini Pro hardening for dense-desktop proof, keyboard/focus evidence, and layout-shift posture. |

## Predecessor Dependency

`P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate` is the direct predecessor.

Predecessor proof:

- `P41-DG01` is recorded in
  `docs/plans/2026-05-23-p41-dg01-post-crm33-ui-ux-slice-selection.md`.
- `P41-DG01` completed after mandatory Sonnet 4.6 architecture/scope review through Copilot CLI.
- `P41-DG01` promoted exactly one next slice:
  `P41-UX01 Product Surface UX Audit And Slice Ranking`.
- `P41-UX01` is docs-and-evidence only. Runtime UI edits, route code changes, auth, tenancy,
  schemas, tests, messages, proxy, Stripe, README, `AGENTS.md`, and architecture docs remain
  blocked.

## Audit Method

This audit inspected repo-visible code, tracker/program state, existing E2E markers, and
non-PII visual evidence for canonical public, member, agent, staff, and admin surfaces.

Review dimensions:

- first-viewport clarity and task orientation;
- workflow density and repeated-use efficiency;
- mobile wrapping, tab order, and horizontal-scroll risk;
- accessibility basics for compact controls, live regions, focus, and accessible names;
- locale-copy and English-fall-through risk for user-visible actions;
- operational state visibility, pending feedback, and error recovery;
- Phase C blast radius and ability to prove a future fix without proxy, route, auth, tenancy, or
  schema changes.

Evidence intentionally excludes customer notes, claim narratives, medical/legal facts, insurer
correspondence, emails, phone numbers, support bodies, and raw uploaded-document content.

## Audit Taxonomy

This audit uses one severity and action taxonomy:

- High: current evidence shows a likely repeated-use workflow problem on an existing canonical
  product surface, and the next step should be a bounded design gate.
- Medium: current evidence shows a plausible product-surface risk, but the affected surface,
  ownership, or blast radius is broader than the top candidate.
- Low: current evidence shows a polish or consistency concern without proof that it blocks an
  operator or member workflow.
- Reject: the candidate conflicts with Phase C boundaries or lacks a safe bounded product scope.

Action tags:

- Recommend DG02: included in the proposed next design gate.
- Defer: keep as future P41 evidence, but do not include in DG02 by default.
- Reject: do not promote without a new repo-canonical design gate and evidence.

## Surface Evidence

### Agent CRM

The existing `/agent/crm` page now carries the completed P40 CRM task queue stack:

- open CRM task queue rows render `TaskQueueControls`;
- completed-task recovery rows render `TaskQueueReopenControls`;
- legacy due-follow-up rows remain below the task queues;
- the page preserves `agent-crm-page-ready`, `agent-crm-task-queue-ready`, and
  `agent-crm-task-completed-queue-ready` markers.

Code evidence:

- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` renders the active task queue, completed
  recovery panel, and legacy due-follow-up panel in one page sequence.
- Open task rows use `flex flex-col ... sm:flex-row` row layout and place row actions in a
  secondary column.
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx` now composes Start or
  Complete, due-date edit/clear/save, always-visible priority select/save, and cancellation
  confirmation in one row-local control group.
- `task-queue-due-date-controls.tsx` expands from an edit affordance into a datetime-local input
  plus save, clear, and cancel actions.
- `task-queue-priority-controls.tsx` keeps an always-visible select and save affordance for all
  open queue rows.
- Existing visual snapshots cover agent CRM reporting and empty task-queue states, but the audit
  did not find equivalent non-empty, crowded task-row screenshots proving the combined CRM29 through
  CRM33 control stack across mobile and dense desktop.

Assessment:

Severity: High.

Action tag: Recommend DG02.

The highest-confidence UX risk is not missing CRM functionality. It is the accumulated row-local
control density after P40. The controls are individually scoped and accessible, but together they
create a repeated-use ergonomics risk: agents must scan lead context, status, priority, due date,
lifecycle actions, due-date editor, priority editor, cancellation confirmation, completed recovery,
and legacy follow-up separation on the same route. The future fix should be presentation-only and
preserve the underlying CRM26 actions and P40 behavior.

### Member Surfaces

The member dashboard already has a strong task-oriented shell with a member-ready marker,
active-claim summary, quick actions, claim support entrypoints, and claim-related CTAs. The current
implementation is visually rich and includes layered gradients and blurred decorative background
elements in `apps/web/src/components/dashboard/member-dashboard-v2.tsx`.

Assessment:

Severity: Medium.

Action tag: Defer.

Member surfaces remain important, but prior P18 and P30 slices already addressed member claim-detail
trust and activation clarity. The current evidence does not justify ranking member dashboard polish
above the CRM queue density risk. A future member-dashboard slice should first decide whether the
rich visual treatment is still appropriate for a work-focused member portal, but that is broader
than the smallest post-P40 UX follow-up.

### Staff Claims

Staff claims pages use an explicit operational queue structure with `staff-page-ready`, stacked
mobile grids, route-local controls, and established E2E/visual snapshot coverage. The row structure
is dense, but it is older and more stable than the newly expanded CRM row-control stack.

Assessment:

Severity: Medium.

Action tag: Defer.

Staff claims are not the top follow-up. The surface is operationally dense by nature and already
uses responsive grid stacking. A future slice may improve state grouping or mobile table scanning,
but current evidence ranks it below agent CRM.

### Admin/Ops Filters

The shared `OpsFiltersBar` uses a flex row for filter tabs and a separate search/right-action
region. Some admin claims filter compositions place multiple segmented control groups into the
right-action area. This creates a plausible narrow mobile wrapping risk on admin/ops pages.

Assessment:

Severity: Medium.

Action tag: Defer.

This is a real candidate, but the shared component blast radius is broader than the route-local
agent CRM queue presentation. It should be deferred until the CRM density slice is handled or until
new evidence shows admin filters blocking operator work.

### Public Commercial Surfaces

P25 already completed public commercial entry polish across home, pricing, services, and Free Start
entry surfaces. The current audit did not find stronger post-P40 evidence that public commercial
surfaces should outrank authenticated operational workflow polish.

Assessment:

Severity: Low.

Action tag: Defer.

Public entry follow-up remains deferred. Any future work should be evidence-led and bounded to a
specific conversion or clarity problem rather than reopened as broad marketing-site redesign.

## Candidate Ranking

| Rank | Candidate                                                                        | Severity | Decision            | Action Tag     | Rationale                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------- | -------- | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate` | High     | Recommend           | Recommend DG02 | P40 completed the CRM task queue feature sequence. The next smallest valuable UX step is a design gate for presentation-only consolidation of existing `/agent/crm` row controls, with mobile and dense-desktop proof. |
| 2    | Admin/ops filter wrapping hardening                                              | Medium   | Defer               | Defer          | `OpsFiltersBar` and admin claims right-actions have plausible wrapping risk, but the shared component blast radius is broader than a route-local CRM queue ergonomics slice.                                           |
| 3    | Member dashboard visual hierarchy hardening                                      | Medium   | Defer               | Defer          | The member dashboard is visually rich and may deserve simplification, but prior P18/P30 member trust work makes it less urgent than the new CRM control stack.                                                         |
| 4    | Staff claims queue mobile scanning polish                                        | Medium   | Defer               | Defer          | Staff claims already use responsive grid stacking and established proof. Improvements may be useful but are not the clearest post-P40 risk.                                                                            |
| 5    | Public commercial surface follow-up                                              | Low      | Defer               | Defer          | P25 recently polished this lane. No current evidence outranks authenticated workflow density.                                                                                                                          |
| 6    | Broad portal shell or cross-role navigation redesign                             | Reject   | Reject              | Reject         | This conflicts with Phase C constraints and would reopen route/information-architecture scope without a narrow evidence-backed boundary.                                                                               |
| 7    | Additional CRM runtime feature                                                   | Reject   | Reject for P41-UX01 | Reject         | P40 closed CRM task runtime depth. P41 should first improve professionalism and usability of existing behavior, not add more CRM capability by default.                                                                |

## Recommended Next Gate

Recommend exactly one next design gate:

`P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate`

The future DG02 should design, not implement, a narrow presentation-only hardening slice for the
existing `/agent/crm` CRM task queue rows.

DG02 itself should be a docs/design gate only. It may define guidelines, acceptance criteria, and a
bounded implementation proposal, but any code change must remain a separate later implementation
slice after DG02 is reviewed and promoted. Deferred medium and low findings from this audit are not
part of DG02 unless DG02 explicitly re-ranks them with new evidence.

Recommended DG02 design questions:

- Which existing row actions should remain always visible and which should move into a compact,
  accessible row-local disclosure or action menu?
- How should open task rows preserve Start/Complete urgency while reducing visual competition with
  due-date, priority, and cancellation controls?
- How should completed recovery rows remain visually distinct from active work without looking like
  a full task-history surface?
- What focus, live-region, and keyboard behavior must be preserved when controls move or collapse?
- What mobile and dense-desktop screenshots or Playwright proofs are required before implementation?
  Dense desktop should be defined by DG02 as a concrete viewport or scenario, such as a constrained
  desktop browser width with a non-empty task row containing all existing actions.
- What dynamic proof is needed for keyboard navigation, focus return, live-region messages, and
  row-local pending states? A short screen recording or Playwright trace is preferred when the local
  toolchain can produce it.
- How will the design avoid layout shift and added interaction cost on `/agent/crm` when row actions
  expand, collapse, or refresh after server actions?
- Which existing CRM29 through CRM33 tests must remain green without adding new CRM behavior?

DG02 should not authorize runtime implementation until it is reviewed and promoted. It should
receive mandatory Sonnet 4.6 architecture/scope review through Copilot and, if available, a Gemini
Pro product/mobile/accessibility review.

## Future Implementation Boundary

The likely implementation slice after DG02 should be presentation-only:

- keep existing CRM26 server actions and route-local wrappers;
- keep existing Start/Complete, due-date, priority, cancellation, completed recovery, lead-link,
  queue marker, legacy due-follow-up, and result-copy behavior;
- keep canonical `/agent/crm` routing and `apps/web/src/proxy.ts` unchanged;
- avoid task creation, assignment/reassignment, full history, filters/pagination, staff/admin/member
  task UI, scheduler/cron/reminders/notifications/outbox, assistance execution, schema/RLS/migration
  work, auth/tenancy/routing refactors, Stripe, README, `AGENTS.md`, and architecture-doc changes.

Likely affected files for a later implementation, subject to DG02:

- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`;
- route-local CRM task queue control components;
- route-local component/page tests and targeted `agent-crm-follow-up` E2E proof;
- active app locale message files only if new action-menu or disclosure copy is introduced.

## Reviewer Proof

Model review used minimized non-PII packets containing only design/audit summaries, file paths,
scope boundaries, candidate rankings, and verification expectations.

Sonnet 4.6 architecture/scope review:

- Preferred route: Copilot CLI with `--model claude-sonnet-4.6`.
- Actual route: Copilot CLI returned `quota_exceeded`, so the review completed through direct
  Claude CLI with `--model claude-sonnet-4-6`.
- Verdict: conditionally approvable.
- Blockers: DG02 successor scope needed an explicit docs/design-only type boundary; audit severity
  taxonomy needed to be declared once and applied consistently.
- Hardening applied in `r2`: §Audit Taxonomy now defines one severity/action-tag system; surface
  assessments and ranking use that taxonomy; §Recommended Next Gate now states DG02 is a
  docs/design gate only and cannot absorb runtime implementation.
- Rejected finding: Sonnet suggested tracker status `closed` and program status `queued`; this repo's
  audited tracker vocabulary is `completed`, `in_progress`, `pending`, and `blocked`, so P41-UX01
  uses `completed` and P41-DG02 uses `pending`.

Gemini Pro product/mobile/accessibility review:

- Route: Gemini CLI with `--model gemini-2.5-pro`.
- Verdict: Agree with rank 1 and product direction.
- Blockers: none.
- Hardening applied in `r2`: DG02 questions now call out concrete dense-desktop proof, dynamic
  keyboard/focus evidence, and layout-shift or interaction-cost risk.

## Verification Proof For This Slice

Before opening the P41-UX01 PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `pnpm ci:local:quick` if available in the active environment.

The PR must remain scoped to `docs/plans/**` and repo-size budget metadata if required by
`pnpm repo:size:check`.

Repo-size budget metadata required by this audit:

- `maxTrackedFiles` `3816` -> `3817`;
- `maxCategoryBytes.docs/text` `4100000` -> `4200000`.

## Program/Tracker Closeout State

This slice records the following repo-canonical state:

- `P41-UX01` moves from `pending` to `completed`.
- `P41` remains `in_progress`.
- Exactly one next design gate is recommended: `P41-DG02 Agent CRM Task Queue Action Density And
Mobile Ergonomics Design Gate`.
- No runtime implementation is authorized by P41-UX01.

## Completion State

| Item                                                                             | Status      | Evidence                                                                       |
| -------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `P41-DG01 Post-CRM33 UI/UX Slice Selection Design Gate`                          | complete    | Promoted `P41-UX01` after mandatory Sonnet 4.6 review.                         |
| `P41-UX01 Product Surface UX Audit And Slice Ranking`                            | complete    | This audit and repo-canonical tracker/program closeout.                        |
| `P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate` | recommended | Sole next recommended design gate; not yet promoted as runtime implementation. |

## Final Decision

P41-UX01 recommends exactly one next design gate:

`P41-DG02 Agent CRM Task Queue Action Density And Mobile Ergonomics Design Gate`

Runtime UI implementation remains unauthorized until that design gate is reviewed, promoted, and
recorded in the repo-canonical program/tracker.
