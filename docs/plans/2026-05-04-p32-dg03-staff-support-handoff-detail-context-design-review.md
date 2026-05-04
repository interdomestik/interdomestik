# P32-DG03 Staff Support Handoff Detail Context Design Review

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG03`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: evaluate the staff-side support handoff detail/context gap after `P32-CRM01`
  established the receiving queue and `P32-CRM02` added claim-detail initiated support
  handoffs, and promote at most one bounded implementation slice without touching product code in
  this gate.

## Scope Boundary

This is a design-review and tracker-promotion slice only. It does not authorize product-code
changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route
renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe
reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product
analytics expansion, PR workflow changes, README, AGENTS, or architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing
`*-page-ready` clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole
routing, access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                        | Finding                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#619`, merge commit `9c1c9749365f96cc85ff82c948a71609f239fce1`              | `P32-CRM01` completed the staff receiving queue, branch-scoped staff and branch-manager access, staff-only accept/reassign/close lifecycle, optimistic lifecycle versioning, and member-to-staff E2E receipt proof.                                                                                                                                                         |
| PR `#622`, merge commit `c438cb4023049a39d49701cd1287544e924e0acf`              | `P32-CRM02` completed explicit claim-detail initiated member submission, `/member/help?claimId=...` context rendering, server-verified claim ownership, and staff queue receipt with linked claim context.                                                                                                                                                                  |
| `packages/database/src/schema/crm.ts`                                           | `support_handoffs` already persists `source`, `message`, `contact_preference`, `accepted_at`, `accepted_by_id`, `reassigned_at`, `reassigned_by_id`, `reassign_reason`, `closed_at`, `closed_by_id`, `close_reason`, lifecycle version, timestamps, tenant, branch, member, staff, and optional claim linkage. No schema change is needed for a staff detail-context slice. |
| `packages/domain-claims/src/support-handoffs/queue.ts` and `types.ts`           | The queue read model currently returns subject, a message preview source, status, urgency, trust risk, lifecycle version, timestamps, staff owner, member identity, linked claim summary, and relationship projection. It does not return contact preference, source, lifecycle actor timestamps, reassignment reason, close reason, or a structured full-detail context.   |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.tsx`      | The staff UI renders a dense queue row with a two-line message preview, linked claim shortcut, member summary, relationship projection, risk/status, owner, and lifecycle action forms. There is no staff-visible detail section for the full request, preferred contact channel, origin, or lifecycle reason history.                                                      |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.test.tsx` | Component coverage proves the queue, optimistic accept controls, staff-owned accepted lifecycle forms, branch-manager read-only behavior, and fail-closed branch scope, but it does not prove richer detail context.                                                                                                                                                        |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                              | The E2E gate proves generic member handoff receipt and claim-detail linked handoff receipt, but staff assertions stop at queue-row visibility, accept control, and linked claim text.                                                                                                                                                                                       |

## Gate Decisions

1. A concrete staff-side product gap exists: after CRM02, staff can receive claim-linked support
   handoffs but cannot inspect the full operational context of a handoff from the queue surface.
2. The next implementation should enrich the existing `/staff/support-handoffs` surface rather
   than add a new canonical route or nested detail route. An inline expanded detail section or
   bounded row-level detail panel keeps the canonical route unchanged and limits proxy/routing
   risk.
3. The implementation should reuse the existing `support_handoffs` persistence and current
   tenant/branch/staff read scope. It must not add a schema migration, a second support entity,
   a Relationship table, an abstract Matter system, or stored TrustSignal.
4. Staff and branch managers may inspect the same branch-scoped detail context, but branch-manager
   mutation authority remains unchanged and read-only.
5. Existing staff lifecycle forms remain governed by the current server actions. Detail context
   must not weaken optimistic lifecycle checks, staff ownership checks, branch scope, or close and
   reassignment reason requirements.
6. Source tracking improvements are useful, but not promoted as part of the next slice because
   current creation still hardcodes `source: 'member_help'` and changing source semantics widens
   member creation behavior. The next slice may display current source if already available, but
   it should not change source derivation unless a later gate promotes that explicitly.
7. Duplicate/open-handoff advisory guards are useful, but not promoted here because they change
   member submission behavior. The next slice stays staff-side and inspectability-focused.

## Candidate Ranking

| Rank | Candidate                                                          | Decision                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Staff support handoff detail context                               | Promote as `P32-CRM03`. It is the narrowest post-CRM02 product slice because the staff queue already exists, the necessary context is mostly persisted, and staff need full request/lifecycle context before acting. |
| 2    | New `/staff/support-handoffs/[id]` route                           | Do not promote. It widens routing and E2E surface area when the same user value can be delivered on the existing canonical staff support-handoff route.                                                              |
| 3    | Source tracking split between generic help and claim-detail origin | Defer. It is valuable, but it changes creation semantics and is not required to make existing staff context inspectable.                                                                                             |
| 4    | Duplicate open-handoff advisory guard                              | Defer. It affects member submission behavior and queue-volume policy, not the immediate staff detail-context gap.                                                                                                    |
| 5    | Relationship table                                                 | Do not promote. Relationship remains a read-model projection over member, membership, branch, agent, claim, and support-handoff state.                                                                               |
| 6    | TrustSignal persistence                                            | Do not promote. Trust risk remains derived and no durable signal is needed for the detail context slice.                                                                                                             |
| 7    | Broad CRM operating-system redesign                                | Do not promote. It is wider than the evidenced staff inspectability gap and risks route, auth, tenant, UX, and schema drift.                                                                                         |
| 8    | PR workflow, docs, or tracker automation changes                   | Do not promote as product work. Workflow automation remains separate from P32 product slices.                                                                                                                        |

## Decision

Promote exactly one bounded implementation slice:

`P32-CRM03 Staff Support Handoff Detail Context`

## P32-CRM03 Draft Design Plan

### Scope

- Extend the support-handoff staff read model with existing persisted detail fields needed for
  staff context, such as contact preference, source if useful, full message, accepted/reassigned
  and closed timestamps, reassignment reason, close reason, and lifecycle metadata.
- Render a bounded detail context section on the existing `/staff/support-handoffs` queue row or
  row-level detail panel without adding or renaming routes.
- Keep linked claim context and the existing staff claim shortcut intact.
- Keep member identity, relationship projection, risk, urgency, owner, status, and lifecycle forms
  visible in a staff-operable layout.
- Preserve branch-manager read-only visibility for the same branch-scoped detail context.
- Add focused domain read-model and component tests for the newly surfaced fields.
- Extend the staff support handoff E2E gate to prove a claim-linked handoff exposes staff detail
  context while preserving lifecycle permissions.

### Non-Scope

- `apps/web/src/proxy.ts` changes.
- Canonical route changes or route aliases.
- Auth, tenancy, effective-access, or routing refactors.
- New `support_handoffs` schema migration.
- New support entity, Relationship table, abstract Matter system, or stored TrustSignal.
- Source-derivation changes for member help versus claim detail origins.
- Duplicate/open-handoff advisory guards.
- Branch-manager mutation authority changes.
- Staff lifecycle action semantics changes.
- Stripe, billing-provider, product analytics, broad CRM redesign, broad SaaS redesign,
  agent-workspace redesign, README, AGENTS, or architecture-doc updates.

### Acceptance Criteria

- Staff can inspect full handoff request context from `/staff/support-handoffs` without leaving the
  canonical staff support-handoff route.
- Staff can see contact preference and lifecycle context where already persisted.
- Claim-linked handoffs still show the linked claim shortcut and claim summary.
- Branch managers can inspect branch-scoped detail context but cannot accept, reassign, close,
  message, or mutate handoffs.
- Existing accept, reassign, and close lifecycle forms retain optimistic lifecycle versioning,
  staff ownership checks, branch scope, and reason requirements.
- Existing canonical routes and `*-page-ready` markers remain intact.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, schema, Stripe, Relationship
  persistence, Matter persistence, TrustSignal persistence, README, AGENTS, and architecture-doc
  files remain unchanged.

### Suggested Branch

`codex/p32-crm03-staff-support-handoff-detail-context`

### Verification Standard

- Focused domain read-model tests for detail fields and unchanged branch/assignment filters.
- Focused web component tests for staff detail rendering, branch-manager read-only visibility, and
  unchanged lifecycle controls.
- E2E gate extension for claim-linked handoff receipt with staff-visible detail context.
- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Remote PR checks, SonarCloud, Copilot, Vercel, and PR finalizer green before merge.

## P32-DG03 Verification Proof

Local verification completed on branch
`codex/p32-dg03-staff-support-handoff-detail-context` on 2026-05-04.

| Command                                 | Result                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`                      | Pass.                                                                                                                                                                                                                                      |
| `pnpm plan:status`                      | Pass.                                                                                                                                                                                                                                      |
| `pnpm plan:audit`                       | Pass.                                                                                                                                                                                                                                      |
| `pnpm track:audit`                      | Pass.                                                                                                                                                                                                                                      |
| `pnpm docs:verify`                      | Pass.                                                                                                                                                                                                                                      |
| `pnpm verify-slice -- --static`         | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T042906Z-f13b0a`. Selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`.                                                                         |
| `pnpm verify-slice -- --required-gates` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T042949Z-c26f8f`. Included `security:guard`, fast E2E gate `67 passed, 1 skipped`, smoke E2E `13 passed, 1 skipped`, and standalone `e2e:gate` `114 passed, 4 skipped`. |

Scope audit stayed inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes, auth/tenancy
code, schema files, Stripe surfaces, README, AGENTS, and architecture docs were not changed.
