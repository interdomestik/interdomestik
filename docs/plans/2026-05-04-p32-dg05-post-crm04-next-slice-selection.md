# P32-DG05 Post-CRM04 Next Slice Selection

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG05`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: select the next bounded `P32` implementation slice after completed `P32-CRM04`
  without touching product code in this gate.

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

| Evidence                                                                                 | Finding                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit `1d1e0f3bd4353b9fefa3b3d1dcd23ffb811f80fb`                                        | `P32-CRM04` completed support-handoff origin source tracking on `main`. Claim-detail-originated member submissions now carry the bounded `member_claim_detail` source through creation and staff detail proof.                                 |
| `packages/domain-claims/src/support-handoffs/types.ts`                                   | The support-handoff model now has an allowlisted source contract, but it still has no member-facing active-handoff advisory type or read contract.                                                                                             |
| `packages/domain-claims/src/support-handoffs/create.ts`                                  | Creation remains server-derived for tenant, member, branch, actor, status, urgency, trust-risk, and source normalization. It still creates a new handoff when a member submits again while another open or accepted handoff may already exist. |
| `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`                            | The existing member help form validates selected claim context and now passes bounded source/origin markers, but it does not warn members about already-active support handoffs for the same member or selected claim.                         |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.tsx`               | Staff and read-only branch managers can inspect and filter the receiving queue, so duplicate member submissions would add operational noise rather than unlock new staff capability.                                                           |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                       | The gate proves generic and claim-detail-originated handoffs reach staff and render detail context. It does not prove any member-side duplicate/open-handoff guidance.                                                                         |
| `docs/plans/2026-05-04-p32-dg04-support-handoff-origin-source-tracking-design-review.md` | The prior gate explicitly deferred duplicate/open-handoff advisory behavior because it needed separate member-submission policy decisions.                                                                                                     |

## Gate Decisions

1. `P32-CRM04` consumed the staff-visible source/origin gap and did not add duplicate/open-handoff
   guidance.
2. The next smallest product-facing gap is member-side awareness of an already-active support
   handoff before submitting another request through the same `/member/help` surface.
3. The next implementation must be advisory-first, not a hard duplicate block. Blocking repeat
   submissions would introduce escalation policy, urgency exception, and support SLA decisions that
   are wider than the current evidence.
4. The advisory should use existing `support_handoffs` rows and statuses. No schema migration is
   needed.
5. The advisory read must remain tenant/member scoped and must not expose staff-only notes,
   lifecycle reasons beyond the minimal member-safe status/timing summary, or other members'
   handoffs.
6. Claim-linked advisory matching should prioritize a selected, server-validated member-owned claim
   when present, while generic `/member/help` should only summarize member-level active support
   handoffs without claiming they are duplicates for a specific claim.
7. Creation behavior, source normalization, urgency/trust-risk derivation, staff lifecycle
   semantics, branch-manager read-only behavior, and staff queue/detail scope must remain unchanged.
8. Staff reply, add-note, follow-up workflows, new staff detail routes, Relationship persistence,
   abstract Matter persistence, and stored TrustSignal remain outside this gate.

## Candidate Ranking

| Rank | Candidate                                           | Decision                                                                                                                                                                                      |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Duplicate open-handoff advisory guard               | Promote as `P32-CRM05`. It is the narrowest remaining post-CRM04 product slice because members can currently submit another support handoff without seeing that an active one already exists. |
| 2    | Staff reply or add-note workflow                    | Defer. It adds new communication/action semantics, persistence and notification questions, and staff/member workflow expectations beyond advisory visibility.                                 |
| 3    | Duplicate hard-block or escalation policy           | Do not promote. Blocking repeat submissions requires urgency exceptions, SLA wording, and policy decisions that are wider than the advisory gap.                                              |
| 4    | New `/staff/support-handoffs/[id]` route            | Do not promote. CRM03 solved staff detail inspectability on the existing canonical staff support-handoff route.                                                                               |
| 5    | Broad CRM operating-system redesign                 | Do not promote. It is wider than the evidenced support-handoff operating gaps and risks route, auth, tenancy, schema, and UX drift.                                                           |
| 6    | Relationship table, abstract Matter, or TrustSignal | Do not promote. These remain outside the V3 pilot support-handoff model and are not needed for member-side active-handoff advisory visibility.                                                |

## Decision

Promote exactly one bounded implementation slice:

`P32-CRM05 Duplicate Open-Handoff Advisory Guard`

## P32-CRM05 Draft Design Plan

### Scope

- Add a member-safe active support-handoff advisory read contract for the existing `/member/help`
  form.
- Show a non-blocking advisory when the authenticated member already has an active `open` or
  `accepted` support handoff.
- When a server-validated selected claim is present, prioritize active handoffs for that claim and
  label the advisory as claim-context aware.
- On generic `/member/help`, summarize active member support handoffs without claiming claim-level
  duplication.
- Keep the form submittable so urgent follow-up is not blocked by this slice.
- Keep advisory data minimal: status, created/updated timing, optional claim label, and source label
  are acceptable; staff-only lifecycle reasons, staff identity beyond existing member-safe copy, and
  internal notes are not.
- Add focused domain/web tests for tenant/member scoping, selected-claim matching, generic advisory
  behavior, and the non-blocking submit path.
- Extend E2E gate coverage only if the implementation can do so deterministically without widening
  the product workflow; otherwise add focused component/domain proof and preserve the existing
  staff support-handoff gate.

### Non-Scope

- `apps/web/src/proxy.ts` changes.
- Canonical route changes or route aliases.
- Auth, tenancy, effective-access, or routing refactors.
- New `support_handoffs` schema migration.
- Hard-blocking duplicate submissions.
- New support entity, Relationship table, abstract Matter system, or stored TrustSignal.
- Staff reply, notes, or follow-up workflows.
- Contact-preference, source, urgency, trust-risk, branch, member, tenant, staff, or actor
  derivation changes.
- Branch-manager mutation authority changes.
- Staff lifecycle action semantics changes.
- Stripe, billing-provider, product analytics, broad CRM redesign, broad SaaS redesign,
  agent-workspace redesign, README, AGENTS, or architecture-doc updates.

### Likely Files Touched After Approval

- `packages/domain-claims/src/support-handoffs/types.ts`
- `packages/domain-claims/src/support-handoffs/queue.ts` or a new focused
  `packages/domain-claims/src/support-handoffs/advisory.ts`
- `packages/domain-claims/src/support-handoffs/*.test.ts`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.test.tsx`
- `apps/web/src/messages/en/member-help.json`
- `apps/web/src/messages/mk/member-help.json`
- `apps/web/src/messages/sq/member-help.json`
- `apps/web/src/messages/sr/member-help.json`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts` only if deterministic gate coverage is
  warranted.

### Acceptance Criteria

- Members see a clear, non-blocking advisory before submission when they already have an active
  support handoff.
- Claim-detail-originated help requests show claim-context aware advisory copy when an active
  handoff exists for the same selected, member-owned claim.
- Generic `/member/help` submissions keep generic member-level advisory copy and remain submittable.
- Advisory reads are scoped by tenant and authenticated member identity.
- Advisory data does not expose staff-only notes, internal lifecycle reasons, other members'
  handoffs, or caller-supplied ownership fields.
- Existing support-handoff creation behavior remains unchanged, including source normalization,
  server-derived tenant/member/branch/actor/status/urgency/trust-risk fields, and branch-required
  routing.
- Existing canonical routes and `*-page-ready` markers remain intact.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, schema, Stripe, Relationship
  persistence, Matter persistence, TrustSignal persistence, README, AGENTS, and architecture-doc
  files remain unchanged.

### Suggested Branch

`codex/p32-crm05-open-handoff-advisory`

### Verification Standard

- Focused domain tests for active-handoff advisory scoping and selected-claim matching.
- Focused member help page tests for claim-context advisory, generic advisory, and non-blocking
  submit behavior.
- Focused i18n checks when member-help messages change.
- `git diff --check`
- Focused unit/component coverage for touched files.
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Playwright MCP or least-risk browser validation for the member help advisory path.
- Remote PR checks, SonarCloud, Copilot, Vercel, and PR finalizer green before merge.

## P32-DG05 Verification Proof

Local verification is completed on branch `codex/p32-dg05-post-crm04-next-slice` on 2026-05-04.

| Command                         | Result                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check`              | Pass.                                                                                                                                                                                    |
| `pnpm plan:status`              | Pass.                                                                                                                                                                                    |
| `pnpm plan:audit`               | Pass.                                                                                                                                                                                    |
| `pnpm track:audit`              | Pass.                                                                                                                                                                                    |
| `pnpm docs:verify`              | Pass.                                                                                                                                                                                    |
| `pnpm verify-slice -- --static` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T104134Z-080bee`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`, `contracts_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, schema files, Stripe surfaces, README, AGENTS, and architecture docs must not be
changed by this design gate.
