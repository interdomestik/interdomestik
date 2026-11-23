# MODULE — `packages/domain-activities`

Module contract (R-19). This file was written with the member-notes commands. It describes those commands in full. The activity commands that were already here are only listed: their contract is still to be written.

## Responsibility

- CRM lead activities: `log-lead`, `get-lead`, `map-lead`.
- Member activities: `log-member`, `get-member`.
- Member notes, the internal notes that staff, admins and assigned agents keep about a member: `src/member-notes/`.

## Public API

- `.` (`src/index.ts`), plus one subpath per activity file (`package.json`).
- `./member-notes` (`src/member-notes/index.ts`):
  - the commands `listMemberNotes`, `createMemberNote`, `updateMemberNote`, `deleteMemberNote` and `toggleMemberNotePin`;
  - the strict input schemas, `sanitizeNoteContent` and the note types.

Each command takes `{ session, authority, input }` and returns `{ ok: true, data, audit }` or `{ ok: false, code }`. The codes are UNAUTHORIZED, FORBIDDEN, INVALID_INPUT, EMPTY_CONTENT, NOT_FOUND and NOT_AUTHOR. `audit` holds what the entry point records after a committed write. The only entry points are the five server actions in `apps/web/src/actions/member-notes.ts`, built on `defineAction` (R-05).

## Owned tables

`member_notes`, declared in `packages/database/src/schema/notes.ts`. No other code writes it (R-16). The notes commands also read `user` and `agent_clients`, and lock rows in them, but never write them. Those two tables are owned elsewhere.

## Member notes: rules

- **Actor.** The actor is the authority's principal, and it is accepted only when all of these hold:
  - the authority is a `session` authority;
  - its tenant and its access tenant both equal the session's effective tenant;
  - its principal names the session's user, with exactly the session's role.

  Anything else is UNAUTHORIZED. Tenant and author are always taken from the actor, never from the input.

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
  2. the agent's active assignment, FOR SHARE;
  3. the note, FOR UPDATE.

  A reassignment, revocation or member deletion therefore waits for a running command, and the next command sees the change. The order matches `updateUserAgentCore`, which writes the user row and then the assignment, and the cascade from `user` into `member_notes`. Pin toggles lock the note, so no toggle is lost.

## Tests to run

- `pnpm --filter @interdomestik/domain-activities test`. The member-notes unit tests run against an in-memory database (`src/test/member-notes-db.ts`).
- The restricted-role proof (R-06): `packages/database/test/member-notes-restricted-rls.test.ts`, part of `pnpm db:rls:test`. It runs the real commands under the restricted role on a disposable database. It covers the actor matrix, the cross-tenant cases, and the revocation, reassignment, delete and pin races.

## Open follow-ups (outside this module's change)

- F1: `member_notes.member_id` has no composite key to `user (id, tenant_id)`. The commands refuse a cross-tenant note; the database does not yet.
- F2: the agent's client-profile loader reads the member before it checks the assignment. That race is in the web app, not here.
