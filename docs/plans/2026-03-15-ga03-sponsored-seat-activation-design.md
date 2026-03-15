# GA03 Sponsored Seat Activation Design

## Goal

Add the first member-side activation path for sponsored group seats and expose the first self-upgrade path from sponsored `standard` coverage into `family` coverage without changing routing, tenancy, or claim-privacy architecture.

## Constraints

- `apps/web/src/proxy.ts` remains untouched.
- Group access continues to use the existing consumer membership model.
- Group dashboards stay aggregate-only.
- No new portal or shared group account is introduced.

## Recommended Design

### Sponsored seat representation

Reuse the existing `subscriptions` row as the source of truth for sponsored access.

- `GA01` imports create subscriptions with:
  - `status: 'paused'`
  - `provider: 'group_sponsor'`
  - `acquisitionSource: 'group_roster_import'`
  - no active billing customer id
- Existing imported rows that are already active remain valid and readable.

This keeps the activation state inside the current membership model and makes `GA02` activated-member counts meaningful instead of equating import volume with live activations.

### Activation path

Add a canonical member-side server action that:

- requires an authenticated member session
- resolves tenant scope from the current session
- finds the caller's sponsored subscription only
- rejects non-sponsored or already-active subscriptions
- marks the sponsored subscription `active`
- stamps `currentPeriodStart` and `currentPeriodEnd` for a one-year sponsored cycle
- revalidates the member membership surfaces

Activation is a first-party membership action, not a new invitation subsystem.

### Self-upgrade path

Expose a self-upgrade CTA for members whose sponsored subscription is:

- sponsored
- active
- currently on `standard`

The CTA routes the member into the existing pricing flow with the `family` plan preselected. In billing test mode, the existing mock activation path already updates the user's single subscription row by `userId`, so the testable upgrade path remains inside the current billing model.

### Member UI

Extend `/member/membership` operations UI to surface:

- a sponsored activation card for paused sponsored seats
- a sponsored-family upgrade card for active sponsored `standard` seats
- no upgrade CTA for sponsored `family` seats
- no sponsored CTA for ordinary consumer subscriptions

The existing coverage matrix, documents, and timeline surfaces stay intact.

## Files Affected

- `apps/web/src/lib/actions/agent/register-member.core.ts`
- `apps/web/src/lib/actions/agent/import-members.core.ts`
- `apps/web/src/lib/actions/agent.core.ts`
- `apps/web/src/actions/subscription.core.ts`
- `apps/web/src/components/ops/adapters/membership.ts`
- `apps/web/src/features/member/membership/components/MembershipOpsPage.tsx`
- `apps/web/src/app/[locale]/(app)/member/membership/page.tsx`
- related unit tests

## Testing Strategy

- unit tests for sponsored import defaults and metadata
- unit tests for the sponsored activation action
- unit tests for member membership UI states
- existing verification gates:
  - `pnpm plan:status`
  - `pnpm plan:audit`
  - `pnpm security:guard`
  - `pnpm e2e:gate`
  - `pnpm pr:verify`
