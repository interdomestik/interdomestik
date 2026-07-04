# T-503 Drop Claim Status Closeout

Date: 2026-07-03

Scope: complete the final M0-M5 status-bearing slice by removing the legacy
physical `claims.status` column and preserving status-shaped product output only
as a derived lifecycle compatibility projection.

Authority consumed:

- `docs/plans/2026-07-03-obr-dg41-t503-evidence-ready-authority.md`
- `docs/release/production-evidence.yaml`
- `packages/database/drizzle/0091_t503_drop_claim_status.sql`

Implementation summary:

- Drops `claims.status` and obsolete status indexes/predicates.
- Keeps `case_lifecycle_state` and `recovery_lifecycle_state` authoritative.
- Adds shared derived status compatibility via lifecycle fields.
- Updates member, agent, staff, admin, public tracking, pilot, seed, and script
  paths to derive any legacy status-shaped output from lifecycle fields.
- Changes post-drop repair reporting to non-destructive aggregate evidence.

Local proof:

- `pnpm release:evidence:check`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/domain-claims type-check`
- `pnpm --filter @interdomestik/domain-agent type-check`
- `pnpm --filter @interdomestik/domain-member type-check`
- `pnpm --filter @interdomestik/domain-claims test:unit --coverage --coverage.reporter=text --coverage.reporter=json-summary`
- `pnpm coverage:gate`
- `pnpm security:guard`
- `pnpm repo:size:check`
- `pnpm db:migrations:check-journal`
- `git diff --check`
- `pnpm pr:verify`
- `pnpm e2e:gate` (`134 passed`, `8 skipped`)

Result:
T-503 is complete for local implementation/readiness proof. This does not change
the G04/G05/G09/G10 waiver limits: the waivers authorize implementation
readiness only and do not authorize final `PAID`, finance closure, individual
claimant representation, final settlement, or final `CLOSED`.

No replacement runtime slice is promoted by this closeout. Fresh
current-authority/design-gate selection is required before any follow-on work.
