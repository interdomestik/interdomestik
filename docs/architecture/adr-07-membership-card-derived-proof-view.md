---
status: accepted
date: 2026-06-21
owner: platform + architecture + qa
tracker: T-406
---

# ADR-07: Membership Card Derived Proof View

## Status

Accepted.

## Context

M4 product-model hardening separated membership proof from commercial offer
data before this ADR:

- `T-401` restored the member card for `active` and `grace_period`
  subscriptions and made the card require an active or grace subscription.
- `T-402` split `membership_offer`, `membership_proof`, and
  `membership_workspace_plan`, with type/projection proof that raw price,
  interval, tier, currency, and Paddle price identifiers do not attach to proof
  or workspace outputs.

The card therefore represents current membership proof, not the commercial
offer used to sell or renew membership.

## Decision

The membership card is a derived proof view for active and grace memberships. It
may display proof identity and state such as plan identity, subscription status,
current-period end, and grace-period end. It must not carry or render
price-bearing offer data.

Price, interval, commercial tier, currency, Paddle price identifiers, checkout
metadata, discounts, and renewal-offer terms belong to `membership_offer` or
invoice/billing records, not to `membership_proof` or card output.

Workspace plan projections may expose plan identity needed for work surfaces,
but they remain non-commercial projections. They must not become a side channel
for offer pricing, provider price identifiers, or checkout terms.

## Consequences

Positive:

- Member-visible proof stays stable across commercial offer changes.
- Commercial pricing and provider identifiers stay in offer and billing
  boundaries where disclosure, invoice, and tax rules apply.
- The active/grace card can be reasoned about without treating it as a checkout
  or renewal quote.

Negative:

- Surfaces that need pricing must explicitly read an offer or invoice boundary
  instead of reusing card proof data.

## Boundaries

This ADR records architecture only. It does not change runtime code, tests,
schema, RLS, billing behavior, Paddle integration, product UI, routes, proxy,
auth/session, tenancy, README, or AGENTS.

## Related Work

- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `packages/domain-membership-billing/src/membership-hierarchy.ts`
- `packages/domain-membership-billing/src/membership-hierarchy.test.ts`
- `docs/plans/2026-06-20-obr-dg10-t402-membership-hierarchy-promotion.md`
