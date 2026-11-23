# MODULE — `packages/domain-activities`

Module contract (R-19). It was created on 2026-11-22 for the R-37 role-check fix, which moved the activity access rules into this package (R-16), and extended for the member-notes commands. It records only what those changes verified in the code; the full contract of the lead-activity commands is open work.

## Responsibility

- CRM lead activities (calls, e-mails, meetings and notes on `crm_leads`): `log-lead`, `get-lead`, `map-lead`.
- Member activities: `log-member`, `get-member`.
- Member notes, the internal notes that staff, admins and assigned agents keep about a member: `src/member-notes/`.

The package decides who may read or write each of them.

## Public API

`package.json` exports `.`, `./types`, `./schema`, `./log-lead`, `./log-member`, `./get-lead`, `./get-member`, `./map-lead` and `./member-notes`.

- The activity commands take the session and the `TenantAuthority` that `authorizeSessionTenant` minted from it.
- `./member-notes` (`src/member-notes/index.ts`):
  - the commands `listMemberNotes` and `createMemberNote` (`commands.ts`), and `updateMemberNote`, `deleteMemberNote` and `toggleMemberNotePin` (`change.ts`); the shared result types and admission are in `result.ts`, the access rule in `access.ts`;
  - the strict input schemas, `sanitizeNoteContent` and the note types.

  Each command takes `{ session, authority, input }` and returns `{ ok: true, data, audit }` or `{ ok: false, code }`. The codes are UNAUTHORIZED, FORBIDDEN, INVALID_INPUT, EMPTY_CONTENT, NOT_FOUND and NOT_AUTHOR. `audit` holds what the entry point records after a committed write. The only entry points are the five server actions in `apps/web/src/actions/member-notes.ts`, built on `defineAction` (R-05).

`src/access.ts` (actor binding, role scopes) and `src/assignment.ts` (`holdsActiveAssignment`, the one agent-assignment check shared by member activities and member notes) are internal and are not exported.

## Owned tables

Written by this package: `crm_activities`, `member_activities` and `member_notes` (declared in `packages/database/src/schema/notes.ts`; no other code writes it, R-16). It reads `crm_leads`, `user` and `agent_clients` to decide access, and locks rows in `user` and `agent_clients`, but never writes them; those tables are owned elsewhere.

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

## Member notes: rules

- **Actor.** The actor is the authority's principal, and it is accepted only when all of these hold:
  - the authority is a `session` authority;
  - its tenant and its access tenant both equal the session's effective tenant;
  - its principal names the session's user, with exactly the session's role.

  The last check is `activityActorOf`; the first two are stricter than the activity commands. Anything else is UNAUTHORIZED. Tenant and author are always taken from the actor, never from the input.

- **Roles.** Unchanged from before:
  - `agent` acts only on a member it is **actively** assigned to (`agent_clients.status = 'active'`);
  - `staff` and `admin` act tenant-wide;
  - every other role is FORBIDDEN, branch managers included.

  The member's referring agent (`user.agent_id`) grants nothing. When an assignment ends, the agent loses the member's notes at once, including the notes it wrote itself (owner authorization of 2026-11-23, R-37).

- **Target.** Every command first checks the target inside its own transaction. The target must be a member account (`member`, or the legacy default `user`) of the actor's tenant. A note on any other account, or on a member of another tenant, is never read, changed or created.
- **Change rights.** Unchanged from before: the author may edit or delete a note, and an admin may edit or delete any note. Any actor that may act on the member may pin or unpin its notes.
- **Answers.**
  - An agent that is refused on a list or a create gets FORBIDDEN.
  - Staff and admins who list an unknown, foreign or non-member id get an empty list, as before.
  - Update, delete and pin give one answer, NOT_FOUND, for a note that is unknown, foreign, malformed, or on a member the actor may not act on. This way the answer reveals nothing about the note.
- **Input.** Every input is a strict object, so an extra key (`tenantId`, `authorId` and so on) is refused. Content is stripped of tags. Content that is empty after stripping is EMPTY_CONTENT and is never stored.
- **Concurrency (R-17).** Each command runs in one tenant transaction, and takes its locks in this order:
  1. the member row, FOR SHARE;
  2. the agent's active assignment, FOR SHARE (`holdsActiveAssignment`, shared with member activities);
  3. the note, FOR UPDATE.

  A reassignment, revocation or member deletion therefore waits for a running command, and the next command sees the change. The order matches `updateUserAgentCore`, which writes the user row and then the assignment, and the cascade from `user` into `member_notes`. Pin toggles lock the note, so no toggle is lost.

## Known gaps

- `hasMemberActivitiesTable` in `get-member.ts` and `log-member.ts` is pinned by the tenant guard (`scripts/ci/tenant-guard/contracts.mjs`). A failed probe reads as an absent table. Fixing that needs a guard admission.
- The `Unauthorized` refusals stay plain `Error`s under owner decision B of 2026-11-19 (`src/unauthorized-sites.test.ts`).

## Tests to run

- `pnpm --filter @interdomestik/domain-activities test`. The member-notes unit tests run against an in-memory database (`src/test/member-notes-db.ts`).
- `pnpm db:rls:test` for the restricted-role proofs (R-06), including `packages/database/test/member-notes-restricted-rls.test.ts` (the actor matrix and the cross-tenant cases) and `member-notes-restricted-rls-races.test.ts` (the revocation, member-role change, reassignment, delete and pin races).

## Open follow-ups (outside this module's change)

- F1: `member_notes.member_id` has no composite key to `user (id, tenant_id)`. The commands refuse a cross-tenant note; the database does not yet.
- F2: the agent's client-profile loader reads the member before it checks the assignment. That race is in the web app, not here.
