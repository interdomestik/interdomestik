# MODULE — `packages/domain-activities`

Created on 2026-11-22 for the R-37 role-check fix, which moved the activity access rules into this package (R-16) as a new internal module, `src/access.ts`. It records only what that change verified in the code. A full module contract is open work.

## Responsibility

Lead activities (CRM calls, e-mails, meetings and notes on `crm_leads`) and member activities (on members), read and logged. The package decides who may read or log them.

## Public API

`package.json` exports `.`, `./types`, `./schema`, `./log-lead`, `./log-member`, `./get-lead`, `./get-member` and `./map-lead`. Each command takes the session and the `TenantAuthority` that `authorizeSessionTenant` minted from it. `src/access.ts` is internal and is not exported.

## Owned tables

Written by this package: `crm_activities` and `member_activities`. It reads `crm_leads`, `user` and `agent_clients` to decide access.

## Invariants

- **The actor is the authority's principal.** A principal whose user or role differs from the session is refused (`activityActorOf`).
- **Lead activities.**
  - `admin`, `staff` and `agent` may read and log them. An agent may do so only on its own lead.
  - Every other role is refused before any read.
- **Member activities.**
  - Reading:
    - `member` and the legacy `user` role read only their own activities.
    - An agent reads only members with an active `agent_clients` row for that agent. The member's referring agent (`user.agentId`) is no admission: it loses access when the assignment moves to another agent.
    - `staff`, `tenant_admin`, `admin` and `super_admin` read the tenant.
    - Every other role is refused, `branch_manager` included: under the owner's decision of 2026-11-17, branch managers see no member content.
  - Logging follows the same rule, except that members never log.
- **Check and effect share one tenant transaction.** The checked rows (the lead, the member, the assignment) are read `FOR SHARE` in the transaction that reads the feed or inserts the activity (R-17).
- **The stored tenant and author come from the actor, never from the input.**
- **Proof on a real database.** The restricted-role tests `packages/database/test/lead-activities-restricted-rls.test.ts`, `lead-activity-writes-restricted-rls.test.ts` (with a reassignment race) and `member-activities-restricted-rls.test.ts` (with a revocation race) and `member-activities-reassignment-restricted-rls.test.ts` (the referring agent refused, and a reassignment from one agent to another) prove these rules (`test:rls`).

## Known gaps

- `hasMemberActivitiesTable` in `get-member.ts` and `log-member.ts` is pinned by the tenant guard (`scripts/ci/tenant-guard/contracts.mjs`). A failed probe reads as an absent table. Fixing that needs a guard admission.
- The `Unauthorized` refusals stay plain `Error`s under owner decision B of 2026-11-19 (`src/unauthorized-sites.test.ts`).

## Tests to run

- `pnpm --filter @interdomestik/domain-activities test:unit`.
- `pnpm db:rls:test` for the restricted-role proofs.
