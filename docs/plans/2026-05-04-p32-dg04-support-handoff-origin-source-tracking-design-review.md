# P32-DG04 Support Handoff Origin Source Tracking Design Review

## Metadata

- Date: 2026-05-04
- Slice: `P32-DG04`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: evaluate the post-`P32-CRM03` source/origin gap now that staff can inspect support
  handoff detail context, and promote at most one bounded implementation slice without touching
  product code in this gate.

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

| Evidence                                                                                    | Finding                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#626`, merge commit `fb0a57b8330f1fbb231b70d8e50ba599f1383baf`                          | `P32-CRM03` completed on-demand staff support-handoff detail context. Staff and read-only branch managers can now inspect contact preference, source, full message, linked claim context, relationship projection, and lifecycle timeline metadata.      |
| `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/support-handoff-detail-panel.tsx` | The detail panel already renders a source line and maps `member_help` to the member help page label while mapping `claim_detail` and `member_claim_detail` to the claim-detail label. The UI can display a claim-detail source if creation persists one. |
| `packages/domain-claims/src/support-handoffs/create.ts`                                     | The creation core still inserts `source: 'member_help'` and writes audit metadata with `source: 'member_help'` for every member support handoff, including handoffs that entered `/member/help` from a claim detail CTA.                                 |
| `apps/web/src/actions/support-handoffs/create.core.ts`                                      | The web action normalizes `claimId`, `contactPreference`, `subject`, and `message`, but it does not normalize or pass a source/origin signal into the governed domain core.                                                                              |
| `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`                               | The help page reads a `claimId` search param, validates it against member-owned claim options, preselects it in the form, and renders a claim context card, but the form only sends `locale`; it does not send a bounded origin marker.                  |
| `apps/web/src/features/claims/tracking/memberTrustSummary.ts`                               | The claim-detail trust/SLA CTA now links to `/member/help?claimId=...`, preserving selected claim context before explicit member submission.                                                                                                             |
| `packages/domain-claims/src/support-handoffs/types.ts`                                      | `CreateSupportHandoffInput` includes subject, message, contact preference, and optional claim ID. It has no explicit allowed source/origin type today.                                                                                                   |
| `packages/domain-claims/src/support-handoffs/create.test.ts`                                | Existing creation tests assert that persisted source is `member_help`, including the claim-linked creation path.                                                                                                                                         |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`                                          | The gate proves claim-detail initiated receipt and staff detail expansion after CRM03, but it does not assert that the source displayed in the staff detail panel distinguishes claim-detail origin from generic help-page origin.                       |

## Gate Decisions

1. A concrete product-facing gap exists after CRM03: source is now staff-visible operational
   context, but the recorded source is not accurate for claim-detail-originated handoffs.
2. The next implementation should reuse the existing `support_handoffs.source` column. No schema
   migration is needed.
3. The implementation must not trust arbitrary caller-supplied source text. Source values must be
   allowlisted and derived or validated at the governed creation boundary.
4. Generic `/member/help` submissions should continue to persist `member_help`.
5. Claim-detail initiated submissions that arrive through the existing `/member/help?claimId=...`
   path and submit with server-verified member-owned claim context should persist a claim-detail
   source value already supported by the staff detail UI, preferably `member_claim_detail`.
6. Claim linkage, urgency/trust-risk derivation, tenant/member/branch/actor derivation, staff
   lifecycle semantics, branch-manager read-only behavior, and staff detail fetch scope must remain
   unchanged.
7. Duplicate/open-handoff advisory guards remain valuable, but they affect member submission
   policy and queue-volume behavior. They are not promoted in this gate.
8. Staff reply, notes, or follow-up workflows remain outside this source-origin correction and
   require a separate design gate if promoted later.

## Candidate Ranking

| Rank | Candidate                                           | Decision                                                                                                                                                                                                      |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Support handoff origin source tracking              | Promote as `P32-CRM04`. It is the narrowest post-CRM03 product slice because source is now staff-visible, the persisted column already exists, and claim-detail-originated handoffs currently appear generic. |
| 2    | Duplicate open-handoff advisory guard               | Defer. It changes member submission behavior and requires policy decisions for advisory versus blocking repeats.                                                                                              |
| 3    | Staff reply or add-note workflow                    | Defer. It adds new communication/action semantics beyond the source-origin gap.                                                                                                                               |
| 4    | New `/staff/support-handoffs/[id]` route            | Do not promote. CRM03 already solved staff detail inspectability on the existing canonical staff support-handoff route.                                                                                       |
| 5    | Broad CRM operating-system redesign                 | Do not promote. It is wider than the evidenced source-origin gap and risks route, auth, tenancy, schema, and UX drift.                                                                                        |
| 6    | Relationship table, abstract Matter, or TrustSignal | Do not promote. These remain outside the V3 pilot support-handoff model and are not needed to distinguish support-handoff source.                                                                             |

## Decision

Promote exactly one bounded implementation slice:

`P32-CRM04 Support Handoff Origin Source Tracking`

## P32-CRM04 Draft Design Plan

### Scope

- Add an explicit allowlisted support-handoff source/origin contract for member-created handoffs,
  preserving `member_help` as the default.
- Record `member_claim_detail` when a member starts from a claim-detail CTA, lands on the existing
  `/member/help?claimId=...` form, and explicitly submits with a server-verified owned claim.
- Keep generic help-page submissions and manually selected claim submissions from the generic help
  page on the existing default source unless the implementation can prove the claim-detail origin
  through a bounded route/form marker.
- Normalize source in the web action and the domain creation core so unsupported values fall back
  safely and cannot create arbitrary staff-visible source strings.
- Write the same normalized source into audit metadata.
- Extend focused domain/web tests so generic member-help submissions still persist `member_help`,
  claim-detail-originated submissions persist `member_claim_detail`, and invalid or forged source
  values cannot bypass ownership or source allowlisting.
- Extend the staff support-handoff E2E gate so the claim-detail-originated flow expands staff detail
  and asserts the source label is the claim-detail source label.

### Non-Scope

- `apps/web/src/proxy.ts` changes.
- Canonical route changes or route aliases.
- Auth, tenancy, effective-access, or routing refactors.
- New `support_handoffs` schema migration.
- New support entity, Relationship table, abstract Matter system, or stored TrustSignal.
- Duplicate/open-handoff advisory guard.
- Staff reply, notes, or follow-up workflows.
- Contact-preference, urgency, trust-risk, branch, member, tenant, staff, or actor derivation
  changes.
- Branch-manager mutation authority changes.
- Staff lifecycle action semantics changes.
- Stripe, billing-provider, product analytics, broad CRM redesign, broad SaaS redesign,
  agent-workspace redesign, README, AGENTS, or architecture-doc updates.

### Likely Files Touched After Approval

- `packages/domain-claims/src/support-handoffs/types.ts`
- `packages/domain-claims/src/support-handoffs/create.ts`
- `packages/domain-claims/src/support-handoffs/create.test.ts`
- `apps/web/src/actions/support-handoffs/create.core.ts`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.tsx`
- `apps/web/src/app/[locale]/(app)/member/help/_core.entry.test.tsx`
- `apps/web/src/app/[locale]/(staff)/staff/support-handoffs/_core.entry.test.tsx`
- `apps/web/e2e/gate/staff-support-handoffs.spec.ts`

Locale message files are not expected to change because CRM03 already added
`detail.source_member_help` and `detail.source_claim_detail` labels for supported locales.

### Acceptance Criteria

- Claim-detail-originated support handoffs show the claim-detail source label in the expanded staff
  support-handoff detail panel.
- Generic `/member/help` submissions continue to show the member-help source label.
- Unsupported or forged source values cannot produce arbitrary persisted source strings.
- Caller-supplied tenant, member, branch, staff, actor, status, urgency, and trust-risk fields
  remain forbidden and server-derived.
- Existing claim ownership validation remains required before a claim-linked handoff is created.
- Existing staff and branch-manager read/mutation permissions remain unchanged.
- Existing canonical routes and `*-page-ready` markers remain intact.
- `apps/web/src/proxy.ts`, auth layering, tenancy architecture, schema, Stripe, Relationship
  persistence, Matter persistence, TrustSignal persistence, README, AGENTS, and architecture-doc
  files remain unchanged.

### Suggested Branch

`codex/p32-crm04-support-handoff-origin-source`

### Verification Standard

- Focused domain tests for allowed source normalization, audit metadata source, unchanged generic
  default, invalid source fallback, claim ownership validation, and forbidden ownership-field
  rejection.
- Focused web tests for the help-page origin marker and action input normalization.
- Focused staff component test or E2E assertion that the expanded detail panel renders the
  claim-detail source label for a claim-detail-originated handoff.
- `git diff --check`
- Focused unit/component coverage for touched files.
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Remote PR checks, SonarCloud, Copilot, Vercel, and PR finalizer green before merge.

## P32-DG04 Verification Proof

Local verification is completed on branch
`codex/p32-dg04-support-handoff-origin-source` on 2026-05-04.

| Command                         | Result                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `git diff --check`              | Pass.                                                                                |
| `pnpm plan:status`              | Pass.                                                                                |
| `pnpm plan:audit`               | Pass.                                                                                |
| `pnpm track:audit`              | Pass.                                                                                |
| `pnpm docs:verify`              | Pass.                                                                                |
| `pnpm verify-slice -- --static` | Pass. Run root: `tmp/multi-agent/verify-slice/verify-slice-20260504T071017Z-d9eba6`. |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, schema files, Stripe surfaces, README, AGENTS, and architecture docs must not be
changed by this design gate.
