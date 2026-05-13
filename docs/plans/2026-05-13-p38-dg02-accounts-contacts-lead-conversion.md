# P38-DG02 Accounts, Contacts, And Lead Conversion Design

## Status

- Date: 2026-05-13
- Classification: design gate and implementation promotion
- Current branch: `codex/p38-crm01-domain-outbox`
- Promoted implementation slice: `P38-CRM02 Accounts, Contacts, And Lead Conversion Foundation`

## Inputs

- `P38-DG01` ranked accounts, contacts, and lead conversion immediately after the CRM outbox.
- `P38-CRM01` added the domain outbox contract and CRM domain event vocabulary without schema or worker changes.
- The CRM review identified `crmLeads.fullName | companyName` as the main model gap blocking professional account health, member relationship, and dashboard views.

## Decision

Promote `P38-CRM02 Accounts, Contacts, And Lead Conversion Foundation` as the next bounded implementation slice.

The implementation must start in `packages/domain-crm` and preserve the existing package boundary:

- Add domain modules for `accounts`, `contacts`, and `lead-conversion`.
- Define first-class account and contact aggregate types with tenant, branch, ownership, archive, and audit-ready metadata.
- Define account-contact relationships as an explicit typed association with role and primary-contact semantics.
- Define lead conversion as a state transition from pre-qualified lead to account/contact references.
- Model conversion history append-only at the domain contract layer.
- Use injected clock and ID services for deterministic tests.
- Use repository ports and in-memory adapters in unit proof.
- Emit typed CRM domain events through the outbox helpers where conversion creates account/contact state.

## P38-CRM02 Scope

In scope:

- `packages/domain-crm/src/accounts`
- `packages/domain-crm/src/contacts`
- `packages/domain-crm/src/lead-conversion`
- `packages/domain-crm/src/index.ts`
- `packages/domain-crm/package.json`
- Focused in-memory unit tests for create/update/archive and conversion behavior.
- Program/tracker evidence updates.

Out of scope unless separately authorized:

- Database schema and migrations for `crm_accounts`, `crm_contacts`, `crm_account_contacts`, or conversion history.
- SQL adapters under `apps/web/src/lib/domain-crm`.
- Web routes, UI, dashboards, read-model expansion, or data backfill.
- Lead dedupe, routing, pipeline/deal stages, scoring, sequences, templates, consent, external enrichment, or workflow automation.
- Proxy, canonical route, auth/tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc edits.

## Acceptance Criteria

- `packages/domain-crm` exports account, contact, account-contact, and lead-conversion contracts.
- Creating an account/contact validates tenant scope, branch scope where required, and deterministic identifiers.
- Account-contact association validates both sides are same-tenant and supports role and primary-contact metadata.
- `convertCrmLead` validates actor scope, source lead eligibility, destination account/contact references, and idempotent already-converted behavior.
- Conversion appends a typed conversion-history record through the repository port contract.
- Conversion can enqueue typed outbox events using the existing `P38-CRM01` outbox helpers.
- Unit tests prove valid conversion, invalid cross-tenant references, missing branch scope, duplicate conversion, and archived destination rejection.

## Verification Plan

Focused proof:

- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm exec prettier --check packages/domain-crm/package.json packages/domain-crm/src/index.ts 'packages/domain-crm/src/{accounts,contacts,lead-conversion}/**/*.ts'`

Required proof before PR:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Non-Goals

- No persistence schema in this slice.
- No web adapter or UI wiring in this slice.
- No dashboard reporting changes before persisted accounts/contacts and pipelines exist.
- No broad CRM redesign or route behavior changes.
