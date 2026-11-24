# MODULE — `packages/domain-leads`

Created on 2026-11-22 for the R-37 role-check fix, because R-19 requires this file before the package's public API changes (the new `./list` export). It records only what that change verified in the code; the package's other commands are listed from their exports and writes and were **not reviewed** here. A full module contract is open work.

## Responsibility

The member-lead lifecycle: capture (`create`), payment attempts (`payment`), conversion into a member (`convert`) and the member-email conflict check (`member-email-conflict`). Since this change it also decides **who sees which member leads** (`list`), the rule R-16 places with the table's owner.

## Public API

`package.json` exports `.`, `./create`, `./payment`, `./list`, `./convert`, `./member-email-conflict`, `./agent-status` and `./sales-admission`. From `./list`:

- `listVisibleMemberLeads(actor, authority, input)`: the member leads the actor may see, newest first, at most 100, with their payment attempts. It returns `{ ok: true, leads }` or `{ ok: false, code }`, where `code` is `FORBIDDEN`, `FORBIDDEN_NO_BRANCH` or `VALIDATION_ERROR`.
- `memberLeadListRefusal(actor, authority)`: the same refusal, decided before any input is parsed, or `null`.
- `listMemberLeadsSchema`: the strict input (`status`, `branchId`, `search`). An unknown key, such as an identity or a tenant, is a validation error.

## Sales admission (WP-10 closed pilot)

Lead commands use the tenant authority supplied by the caller. `startPayment` takes the tenant's `new_sales` share lock in the transaction that marks payment pending and writes the attempt. `updateScopedAgentLeadStatus` applies the same check in the agent-scoped write transaction when the requested status is `converted`. Both commands throw `SalesClosedError` when admission is closed.

`@interdomestik/domain-leads/sales-admission` exports `assertLeadSalesOpen` for cash approval and resubmission to check admission in their own tenant transactions. The check takes the same share lock and records a failed switch read before throwing `SalesClosedError`.

`convertLeadToMember` requires an admission alongside the lead ID and optional plan. Under the lead lock, `{ kind: 'check' }` requires open sales. `{ kind: 'verified_cash', attemptId }` requires a paid lead and a succeeded, verified cash attempt for that lead in the same tenant. This second path completes a sale admitted before a stop.

## Owned tables

Written by this package (counted from its `insert` and `update` calls, not reviewed): `member_leads` and `lead_payment_attempts`. Conversion also writes `user`, `subscriptions`, `membership_cards` and `audit_log` rows. Which package owns those is not settled here.

## Invariants

- **Lead visibility comes only from the authority's principal, bound to the actor.** The actor is the session's user; a principal with another id, role or branch is refused with `FORBIDDEN`.
  - An agent sees its own leads.
  - A branch manager sees its branch. Without a branch it is refused with `FORBIDDEN_NO_BRANCH`.
  - `admin`, `tenant_admin` and `super_admin` see the tenant, and may narrow to one branch.
  - Every other role, and a principal without a role, is refused with `FORBIDDEN`.
  - The rule is enforced in code (`src/list.ts`). It is proven on a real database by `packages/database/test/member-leads-list-restricted-rls.test.ts` (`test:rls`).
- The tenant comes from the authority, and the read runs in one `withTenantAuthority` transaction under the `member_leads` row policy.

## Tests to run

- Unit, through the action: `apps/web/src/actions/leads/dashboard.test.ts`.
- Restricted role on a real database: `pnpm db:rls:test`.
- Package unit tests: `pnpm --filter @interdomestik/domain-leads test:unit`.
