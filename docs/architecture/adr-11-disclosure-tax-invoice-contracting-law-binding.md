---
status: accepted
date: 2026-06-21
owner: platform + architecture + qa
tracker: T-406
---

# ADR-11: Disclosure, Tax, Invoice, And Contracting-Law Binding

## Status

Accepted.

## Context

M1 and M4 work established entity-of-record and billing snapshot boundaries:

- `T-111` added tenant governing-law and terms-version foundations.
- `T-112` added subscription `legal_tenant_id`, `billing_entity`,
  `governing_law_snapshot`, and `terms_version_accepted` foundations.
- `T-407` rendered contracting company plus governing law at signup, on
  membership, and on invoices.
- `T-408` bound Paddle membership invoicing/webhook reconciliation to stored
  subscription snapshots and recovery success-fee invoicing to
  `recovery_legal_tenant_id`.

## Decision

Disclosure, tax, invoice, and contracting-law behavior bind to the contracting
entity recorded for the transaction, not to ambient host, session, branch,
access tenant, or current display tenant context.

Membership contracts bind to the stored subscription snapshot:
`legal_tenant_id`, `billing_entity`, `governing_law_snapshot`, and
`terms_version_accepted`. Paddle membership checkout, invoicing, and webhook
reconciliation must use that snapshot as the entity-of-record boundary.

Recovery success-fee contracts bind to the recovery representation entity,
including `recovery_legal_tenant_id` and the stored recovery billing snapshot.
They must not borrow the membership entity, host tenant, session tenant, or
access tenant when recovery law and representation have diverged.

Tax, currency, invoice identity, contracting-law copy, and company disclosure
must be derived from the same stored contracting entity boundary used for the
charge and reconciliation path.

## Consequences

Positive:

- Members and recovery customers see the entity and governing-law facts that
  match the charge and invoice.
- Paddle reconciliation cannot silently switch entities from request/session
  context.
- Cross-entity recovery work can bill the correct legal entity without changing
  membership ownership.

Negative:

- Missing or conflicting stored entity snapshots must fail closed or require a
  separately authorized repair path before charging.

## Boundaries

This ADR records architecture only. It does not change billing behavior,
Paddle integration, tax calculation, invoices, schema, migrations, RLS, product
UI, routes, proxy, auth/session, tenancy, README, or AGENTS.

## Related Work

- `docs/architecture/adr-02-case-recovery-split.md`
- `packages/database/src/schema/subscriptions.ts`
- `packages/database/src/schema/tenants.ts`
- `packages/domain-membership-billing/src/billing-snapshot.ts`
- `packages/domain-membership-billing/src/paddle-entity-disclosure.ts`
- `packages/domain-membership-billing/src/paddle-webhooks/invariant-scope.ts`
- `packages/domain-membership-billing/src/success-fees/recovery-success-fee-billing.ts`
