# P32-DG06 Duplicate Open-Handoff Advisory Guard Design Review

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG06`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: review and lock the implementation design for CRM05 before product-code work starts.

## Scope Boundary

This is a design-review and implementation-scope approval slice only. It does not authorize
product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`,
canonical route renames, auth layering changes, tenancy architecture changes, database schema
changes, Stripe reintroduction, staff reply workflows, broad CRM redesign, broad SaaS redesign,
agent-workspace redesign, product analytics expansion, PR workflow changes, README, AGENTS, or
architecture docs.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                            | Finding                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-04-p32-dg05-post-crm04-next-slice-selection.md` | `P32-DG05` promoted `P32-CRM05` as the next bounded implementation slice and required advisory-first behavior, not hard duplicate blocking.                                                     |
| `packages/domain-claims/src/support-handoffs/types.ts`              | Support handoffs currently have three statuses: `open`, `accepted`, and `closed`. No member-safe advisory payload or active-handoff read contract exists yet.                                   |
| `packages/domain-claims/src/support-handoffs/create.ts`             | Creation already derives tenant, member, branch, status, urgency, trust-risk, source, and actor data server-side, validates selected member-owned claims, and still permits repeat submissions. |
| `packages/domain-claims/src/support-handoffs/queue.ts`              | Staff queue and detail reads expose operational fields that are too broad for member-facing advisory copy, including message text, staff assignment, and lifecycle reasons.                     |
| `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`       | The existing `/member/help` surface validates selected claim context and renders member submission state, but it has no active-handoff advisory before the form.                                |
| `apps/web/src/app/[locale]/(app)/member/help/_core.entry.test.tsx`  | Existing tests prove claim-context preselection, source hint pass-through, inaccessible-claim rejection before submission, and non-member redirect behavior.                                    |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                  | Existing E2E proof focuses on member-to-staff creation and staff detail context, not member-side duplicate/open-handoff guidance.                                                               |

## Gate Decisions

1. `open` and `accepted` support handoffs are active for the advisory. `closed` handoffs are not
   active and must not trigger the duplicate/open-handoff advisory.
2. The implementation must add a member-safe advisory read contract instead of reusing staff queue
   DTOs. The contract must be tenant-scoped and authenticated-member-scoped.
3. The read contract may expose only minimal member-safe fields: active count, primary handoff
   status, created/updated timestamps, source label, and optional linked-claim label/status.
4. The read contract must not expose staff-only message body, internal lifecycle reasons, staff
   assignment identity, staff notes, staff-only actor IDs, other members' handoffs, or
   caller-supplied ownership fields.
5. When `/member/help` has a server-validated selected claim, advisory matching must first look for
   active handoffs linked to that same claim and render claim-specific copy when one exists.
6. If no same-claim active handoff exists but the member has other active handoffs, `/member/help`
   may render a generic member-level advisory. That copy must not imply the selected claim already
   has a duplicate handoff.
7. Generic `/member/help` with no selected claim may render a generic member-level advisory for
   active member handoffs.
8. The advisory is non-blocking. The submit button, creation action, source normalization, selected
   claim validation, branch-required routing, urgency/trust-risk derivation, staff lifecycle, and
   branch-manager read-only behavior must remain unchanged.
9. No schema migration is needed. The implementation must query existing `support_handoffs` rows and
   the existing optional claim relationship.
10. The implementation must stay on the existing `/member/help` route and preserve the
    `member-page-ready` clarity marker.
11. The advisory query must use an explicit active-status allowlist, equivalent to
    `IN ('open', 'accepted')`, rather than `status != 'closed'`.
12. The advisory function signature must stay narrow and member-only:
    `getMemberActiveHandoffAdvisory({ tenantId, memberId, claimId? })`. It must not accept
    `staffId`, `branchId`, `viewerRole`, `assignment`, or other staff-queue parameters.
13. The member-facing DTO must be a named type separate from `SupportHandoffQueueItem` so reviewers
    can audit the member-safe boundary directly.
14. Advisory rendering should be extracted into a co-located member-help server component rather
    than inlining fetch and branch logic into `_core.entry.tsx`.
15. Advisory copy must be localized through the existing help namespace for every supported member
    help locale.
16. A composite advisory index on `(tenant_id, member_id, status)` is not authorized by this gate
    because index DDL still changes schema/migration state in this repo. If CRM05 evidence shows a
    page-load performance issue, a later gate may promote that index as a focused optimization.

## Approved P32-CRM05 Implementation Design

### Slice Goal

Add non-blocking member-side advisory visibility on the existing `/member/help` form when the
authenticated member already has an active support handoff.

### Product-Facing Behavior

- Members see advisory copy before the support request form when an active `open` or `accepted`
  support handoff already exists.
- If the member arrived with a server-validated selected claim and that claim already has an active
  handoff, the advisory uses claim-context copy.
- If the selected claim does not have an active handoff but the member has other active handoffs,
  the advisory uses generic account-level copy.
- Members can still submit the form in every advisory state.

### Read Contract

Add a focused member advisory read contract, preferably in
`packages/domain-claims/src/support-handoffs/advisory.ts`, exported through the existing
support-handoff package boundary.

The contract function should be named around `getMemberActiveHandoffAdvisory` and accept only:

- `tenantId`
- `memberId`
- optional server-validated `claimId`

It must not accept staff or queue parameters such as `staffId`, `branchId`, `viewerRole`,
`assignment`, `status`, `urgency`, or `claimLink`.

The member-facing type should be explicit and separate from staff queue DTOs:

```ts
export type MemberActiveHandoffSummary = {
  scope: 'claim' | 'member';
  activeCount: number;
  primaryStatus: 'open' | 'accepted';
  createdAt: string;
  updatedAt: string;
  sourceLabel: string;
  linkedClaim: {
    label: string;
    status: string | null;
  } | null;
};
```

Implementation detail may vary, but the DTO must remain member-safe and must not import or expose
staff queue/detail DTOs.

### Query Semantics

- Always filter by `support_handoffs.tenant_id = tenantId`.
- Always filter by `support_handoffs.member_id = memberId`.
- Always filter active statuses to `open` and `accepted` with an explicit `IN` condition, such as
  Drizzle `inArray(supportHandoffs.status, ['open', 'accepted'])`.
- Prefer same-claim active handoffs when `selectedClaimId` is present.
- Exclude `closed` handoffs from advisory matches.
- Join claims only for member-safe claim label/status fields and only within the same tenant.
- Prefer a lightweight query pattern: count active rows for `activeCount`, then fetch at most one
  primary same-claim active row when `claimId` is present. The implementation must not fetch every
  active handoff only to compute a count.
- Do not add a new support-handoff index in CRM05. The possible
  `(tenant_id, member_id, status)` index is recorded as a deferred optimization pending explicit
  schema/index authorization.

### Rendering Contract

- Add a co-located server component such as
  `apps/web/src/app/[locale]/(app)/member/help/_advisory-banner.tsx`.
- Keep `_core.entry.tsx` responsible for session, selected claim validation, existing layout, and
  form wiring.
- Keep the advisory component responsible for fetching the advisory summary and rendering exactly
  three branches: claim-specific advisory, generic member-level advisory, and no rendered advisory.
- The advisory must include a localized timestamp derived from `createdAt` or `updatedAt` so the
  member can see when the active support request was opened or last updated.

### Copy Contract

Add localized help namespace keys for all rendered advisory copy in `en`, `mk`, `sq`, and `sr`.
The keys should cover:

- claim-specific active handoff copy
- generic member-level active handoff copy with `{count}`
- status and timestamp metadata, with localized date formatting

The no-advisory branch should render no visible banner and should be covered by tests as absence.

### Likely Files Touched After Approval

- `packages/domain-claims/src/support-handoffs/types.ts`
- `packages/domain-claims/src/support-handoffs/advisory.ts`
- `packages/domain-claims/src/support-handoffs/advisory.test.ts`
- `packages/domain-claims/src/support-handoffs/index.ts`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.test.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_advisory-banner.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_advisory-banner.test.tsx`
- `apps/web/src/messages/en/member-help.json`
- `apps/web/src/messages/mk/member-help.json`
- `apps/web/src/messages/sq/member-help.json`
- `apps/web/src/messages/sr/member-help.json`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts` only if deterministic member-side advisory
  proof can be added without widening the gate beyond the existing support-handoff flow.

### Non-Goals

- Hard-blocking duplicate submissions.
- Changing support-handoff creation behavior.
- Changing support-handoff source normalization.
- Changing selected-claim validation or ownership rules.
- Adding staff reply, notes, notifications, follow-up workflows, or new staff detail routes.
- Adding schema, migrations, Relationship persistence, abstract Matter persistence, or stored
  TrustSignal.
- Adding the possible `(tenant_id, member_id, status)` support-handoff index without a later
  schema/index authorization gate.
- Changing proxy, canonical routes, auth, tenancy architecture, branch-manager mutation authority,
  staff lifecycle semantics, Stripe, README, AGENTS, or architecture docs.

### Acceptance Criteria

- Active means `open` or `accepted`; `closed` handoffs do not trigger advisory copy.
- Advisory reads are tenant/member scoped and do not leak other members' handoffs.
- The advisory read contract has a narrow member-only signature and a named
  `MemberActiveHandoffSummary` type.
- Active status filtering uses an explicit `open` / `accepted` allowlist, not `status != 'closed'`.
- Same-claim active handoffs produce claim-context advisory copy when the selected claim is
  server-validated.
- Other active member handoffs produce only generic member-level advisory copy.
- Advisory data stays member-safe and excludes staff-only detail.
- Field-exclusion tests prove the advisory response does not contain staff-only fields such as
  `staffId`, `staffName`, `message`, `closeReason`, `reassignReason`, `acceptedByName`,
  `closedByName`, or `reassignedByName`.
- Advisory rendering is isolated in a co-located component and localized in every member-help
  locale.
- Claim-specific advisory copy includes a localized timestamp.
- The `/member/help` form remains submittable in every advisory state.
- Support-handoff creation, source normalization, branch routing, urgency/trust-risk derivation,
  staff lifecycle, and branch-manager read-only behavior remain unchanged.
- Existing canonical routes and `member-page-ready` remain preserved.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, schema, Stripe, Relationship,
  Matter, TrustSignal, README, AGENTS, and architecture-doc files remain unchanged.

### Verification Standard For P32-CRM05

- Focused domain tests for tenant/member scoping, active-status filtering, closed exclusion,
  selected-claim priority, member-level fallback, narrow-signature behavior, explicit field
  exclusion, and the count-plus-primary-query behavior where practical.
- Focused member help tests for claim-context advisory, generic advisory, closed/no-advisory state,
  inaccessible selected-claim behavior, and non-blocking form submission.
- Focused i18n checks for all changed member-help locale files.
- Focused advisory-banner component tests for claim-specific, generic member-level, and no-advisory
  branches.
- E2E proof for member-side advisory behavior when deterministic: create a handoff, revisit
  `/member/help` for generic advisory, revisit `/member/help?claimId=<linked-claim>` for
  claim-specific advisory, and submit again to prove the advisory is non-blocking.
- `git diff --check`
- Focused unit/component coverage for touched files.
- `pnpm verify-slice -- --static`
- Mandatory implementation reviewer pool.
- `pnpm verify-slice -- --required-gates`
- Playwright MCP or least-risk browser validation for the member help advisory path, including
  generic, claim-specific, and no-advisory states when a reachable environment is available.
- Remote PR checks, SonarCloud, Copilot/reviewer comments, Vercel, and PR finalizer green before
  merge.

## P32-DG06 Verification Proof

Local verification is completed on branch `codex/p32-dg06-open-handoff-advisory-design` on
2026-05-04.

| Command                         | Result                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                                                                                                                            |
| `pnpm plan:status`              | Pass.                                                                                                                                                                                            |
| `pnpm plan:audit`               | Pass.                                                                                                                                                                                            |
| `pnpm track:audit`              | Pass.                                                                                                                                                                                            |
| `pnpm docs:verify`              | Pass.                                                                                                                                                                                            |
| `pnpm verify-slice -- --static` | Pass after review-feedback updates. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T111432Z-739981`; selected reviewers: `security_reviewer`, `architect_reviewer`, `qa_reviewer`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, schema files, Stripe surfaces, README, AGENTS, and architecture docs must not be
changed by this design gate.
