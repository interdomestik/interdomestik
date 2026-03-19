# Commission Tracking And Referral Rewards Design

**Date:** 2026-03-19
**Status:** Draft approved in chat, written for review
**Branch Target:** `codex/commission-tracking`

## Goal

Deliver a production-ready ownership and earnings model for membership growth that:

- keeps agent commissions auditable and tenant-safe,
- adds member referral rewards without corrupting the agent commission ledger,
- makes renewal attribution deterministic after agent offboarding or reassignment,
- preserves company-owned revenue when no agent or referral program should apply.

## Scope

This design covers:

- agent commissions for `new_membership` and `renewal`,
- member referral rewards as a separate reward system,
- immediate ownership transfer on offboarding or reassignment,
- company-owned fallback for direct online signups and unassigned members,
- admin controls for ownership transfer and reward-program configuration,
- billing-event driven creation of commissions and referral rewards.

This design does not cover:

- routing refactors or proxy changes,
- multi-level or lifetime referral payouts,
- tax/compliance payout operations beyond configurable thresholds and approval states,
- a new affiliate program distinct from agents or members.

## Existing Repo Constraints

The current repo already contains the main agent commission spine:

- `packages/domain-membership-billing/src/commissions/*`
- `apps/web/src/app/[locale]/(agent)/agent/commissions/_core.entry.tsx`
- `apps/web/src/app/[locale]/admin/commissions/_core.entry.tsx`
- `packages/database/src/schema/agents.ts`

The repo also already models member assignment through:

- `user.agentId`
- `subscriptions.agentId`
- `agent_clients`

This design extends those existing patterns. It does not introduce a separate ownership subsystem unless the existing model proves insufficient during implementation.

## Business Rules

### 1. Initial Membership Attribution

- Direct online signup: company-owned, no commission, no referral reward unless a valid member referral is present.
- Agent-sold signup: `new_membership` commission goes to the selling agent of record.
- Member-referred signup: no agent commission by default unless an agent is also explicitly the owner of sale; instead create a member referral reward.

### 2. Renewal Attribution

- Renewal commissions never use the original selling agent by default.
- Renewal commissions use the current ownership state at the moment the renewal payment succeeds.
- If the member is agent-owned, the current assigned agent receives the renewal commission.
- If the member is company-owned, the company keeps the renewal revenue and no agent renewal commission is created.
- Member referrers do not receive renewal rewards.

Canonical renewal-owner resolution for this branch:

1. `subscriptions.agentId` is the canonical owner used by billing at renewal time.
2. `user.agentId` must mirror the same owner for admin and user surfaces.
3. `agent_clients` is the assignment history/supporting relation and must contain exactly one active row for agent-owned members, or no active row for company-owned members.

If these surfaces disagree, renewal processing must trust `subscriptions.agentId`, log drift, and avoid guessing from older sale metadata.

### 3. Offboarding And Reassignment

- Agent offboarding or reassignment must update the member record immediately.
- Every member must always resolve to one ownership state:
  - `agent-owned`
  - `company-owned`
- If no replacement agent exists, ownership becomes company-owned immediately.
- Historical `new_membership` commission attribution remains unchanged after reassignment.

### 4. Member Referral Rewards

- Member referral rewards are not stored in `agent_commissions`.
- Member referral rewards are earned only on the first successful paid membership event for the referred member.
- Reward values remain configurable. The launch-safe default can be fixed-credit rather than `50%`.
- Reward settlement defaults to account credit.
- Cash payout eligibility is configurable and gated by a configurable threshold, for example `EUR 100`.
- Admin can review, approve, hold, void, or release eligible rewards.

## Recommended Data Model

### Ownership

Use the existing ownership spine as the source of truth:

- `user.agentId`
- `subscriptions.agentId`
- `agent_clients`

Implementation rule:

- `subscriptions.agentId` is the billing-time canonical owner.
- `user.agentId` must be kept in sync as the portal/admin ownership value.
- active `agent_clients` rows are a derived ownership relation plus assignment history.
- `agentId = null` means company-owned.
- Active `agent_clients` rows should exist only for agent-owned members.
- Offboarding or reassignment must update all three surfaces consistently enough that billing, agent views, and admin views resolve the same owner.

This keeps schema churn low and matches the current codebase.

### Agent Commission Ledger

Keep using `agent_commissions` for agent earnings only.

Required semantics:

- `type = new_membership` uses original seller attribution.
- `type = renewal` uses current owner attribution at payment time.
- `status` lifecycle remains `pending -> approved -> paid -> void`.
- Metadata should record attribution source and ownership resolution inputs for auditability.

Suggested metadata additions:

- `saleOwnerType: 'agent' | 'company'`
- `saleOwnerId: string | null`
- `originalSellerAgentId: string | null`
- `ownershipResolvedFrom: 'user.agentId' | 'subscription.agentId' | 'agent_clients' | 'company_default'`

### Member Referral Reward Ledger

Add a separate ledger for member referral rewards and balances.

Recommended table shape:

- `member_referral_rewards`
  - `id`
  - `tenantId`
  - `referrerMemberId`
  - `referredMemberId`
  - `subscriptionId`
  - `rewardType`
  - `rewardValue`
  - `rewardValueType` (`fixed`, `percent`)
  - `status` (`pending`, `approved`, `credited`, `paid`, `void`)
  - `creditedAt`
  - `paidAt`
  - `metadata`

Required idempotency rule:

- exactly one initial referral reward per qualifying subscription purchase event.
- enforce this with a unique key such as `(tenant_id, subscription_id, referrer_member_id, reward_type)` or an equivalent stricter key.
- domain creation logic must mirror `createCommissionCore` by returning the existing record on replay instead of double-crediting.

Optional but likely useful:

- `member_referral_balances`
  - derived or persisted current available credit,
  - pending amount,
  - payout-eligible amount.

The exact balance implementation can remain derived in the first slice if queries stay cheap enough.

### Program Settings

Add tenant-scoped configurable settings for the referral program.

Recommended settings:

- enabled/disabled
- referrer reward mode: `fixed` or `percent`
- referrer reward value
- referred-member benefit mode/value
- settlement mode: `credit_only`, `credit_or_payout`
- payout threshold
- fraud-review toggle

These settings should be admin-editable and safe by default.

## Event Flow

### A. Agent-Sold First Membership

1. Successful membership payment is received from the billing pipeline.
2. Resolve original seller from sale context or subscription creation context.
3. Create `agent_commissions` record for `new_membership`.
4. No member referral reward is created unless the sale also carried a valid referral program event and business rules explicitly allow stacking.

Recommended default:

- do not stack agent sale commission and member referral reward on the same initial membership until explicitly enabled.

### B. Member-Referred First Membership

1. Successful membership payment is received.
2. Resolve referral context from referral code or stored referral relationship.
3. Create member referral reward record only.
4. Mark membership as company-owned unless an agent is explicitly assigned through a separate admin or sales process.

### C. Renewal

1. Successful renewal payment is received.
2. Enter a dedicated renewal-processing path rather than reusing the `handleNewSubscriptionExtras(...)` new-sale path.
3. Resolve current ownership from `subscriptions.agentId`.
4. Optionally verify drift against `user.agentId` and active `agent_clients` rows for audit logging.
5. If current owner is an agent, create a `renewal` commission for that agent.
6. If current owner is company-owned, do not create agent commission.
7. Never create member referral reward on renewal.

## Admin Workflows

### Ownership Transfer

Admin must be able to:

- reassign a member from one agent to another,
- move a member to company-owned,
- see the current owner state clearly,
- perform this immediately during agent offboarding.

Required system behavior:

- update `user.agentId`,
- update active `subscriptions.agentId` in the same transaction as reassignment,
- deactivate or replace active `agent_clients` rows accordingly,
- make `subscriptions.agentId` and `user.agentId` match before the next renewal event is processed,
- keep historical commission attribution unchanged.

### Commission Admin

Admin must be able to:

- review all agent commissions,
- approve, pay, or void them,
- see whether a commission is `new_membership` or `renewal`,
- inspect attribution metadata.

### Referral Rewards Admin

Admin must be able to:

- review member referral rewards,
- approve, credit, pay, hold, or void them,
- see accumulated reward balances,
- manage payout threshold behavior,
- configure referral program settings.

## User-Facing Surfaces

### Agent Portal

The agent commissions page should:

- show `new_membership` vs `renewal`,
- show earned, approved, paid, and pending totals,
- keep scope to the current agent only,
- never expose member referral rewards.

### Member Portal

The member portal should eventually support:

- referral link or code,
- referral reward balance,
- payout threshold progress,
- reward history,
- whether rewards are credit-only or payout-eligible.

This branch may stop short of a full member dashboard if admin + billing + data plumbing lands first, but the schema and actions should support it.

### Admin Portal

Admin needs:

- ownership transfer controls in member/admin user surfaces,
- agent commission management,
- referral reward program management,
- referral reward review and payout handling.

## Security And Tenancy

- All new queries must remain tenant-scoped.
- Agent views must only access their own commission records.
- Members must only access their own referral reward balances and history.
- Admin-only mutation paths must remain explicit and authenticated.
- No proxy or route authority changes are part of this work.

## Testing Strategy

This work should follow TDD with failing tests first for:

### Agent Commission Cases

- `new_membership` commission stays with original seller.
- `renewal` commission uses current owner.
- company-owned renewal creates no agent commission.
- inactive/offboarded original seller does not receive renewal unless still current owner.

### Ownership Transfer Cases

- reassign member from agent A to agent B updates ownership surfaces.
- offboarded member with no replacement becomes company-owned.
- reassignment does not mutate historical `new_membership` commission records.

### Member Referral Cases

- direct online signup creates no reward.
- member-referred signup creates initial reward only.
- reward settings are configurable and not hardcoded.
- reward payout threshold blocks payout below configured amount.
- renewal does not create member referral reward.

### UI/Action Cases

- admin can move member to company-owned.
- admin can assign replacement agent.
- agent sees only their commissions.
- member cannot see another member's referral rewards.

## Recommended Implementation Order

1. Ownership resolution helpers
2. Renewal commission creation path
3. Admin ownership transfer/offboarding actions
4. Member referral reward schema and domain actions
5. Referral program settings
6. Admin reward review surfaces
7. Member reward visibility
8. E2E coverage and final gate verification

## Open Decisions Locked For This Branch

These decisions are approved for implementation unless changed later:

- member referral rewards are separate from agent commissions,
- member referral rewards apply only to the first successful membership payment,
- reward values remain configurable,
- settlement defaults to account credit,
- payout threshold is configurable,
- direct online signup is company-owned,
- offboarding updates ownership immediately,
- renewal follows current owner,
- `new_membership` commission stays with the original seller.

## Recommendation

Implement Commission Tracking on top of the current ownership model, not a new ownership subsystem.

That is the best fit for this repo because it:

- reuses existing commission infrastructure,
- keeps changes local to billing, admin, and ownership actions,
- avoids unnecessary routing or auth churn,
- supports both agent commissions and viral member referrals without mixing their ledgers.
