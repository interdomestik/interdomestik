---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-22
source_gate: docs/plans/2026-06-21-obr-dg21-t503a-readiness-gate.md
---

> Status: Active supporting input for `T-503a`. This report records
> implementation-readiness evidence and does not replace `current-program.md` or
> `current-tracker.md`.

# T-503a Lifecycle Inventory And Status-CAS Deprecation Design

## Scope

This is the non-destructive `T-503a` implementation-readiness package promoted
by `OBR-DG21`. It adds a read-only lifecycle consistency inventory command,
records the current command-path dependency on legacy `claims.status`, and
defines the evidence required before destructive `T-503` can be reconsidered.

Forbidden scope remains unchanged: no `claims.status` drop or rename, no
destructive migration, no schema/RLS migration, no proxy/routing/auth/session/
tenancy/billing/entity migration, no product UI, no Operational Brain runtime,
and no broad M5 or adjacent T-501/T-502/T-504/T-505/T-506/T-507 work.

## Inventory Command

Command:

```bash
node scripts/run-with-default-db-url.mjs pnpm exec tsx scripts/claim-lifecycle-consistency-inventory.ts
```

Read-only SQL preview:

```bash
pnpm exec tsx scripts/claim-lifecycle-consistency-inventory.ts --sql
```

The command aggregates `claim.status`, `claim.case_lifecycle_state`, and
`claim.recovery_lifecycle_state` only. It emits no row-level claim IDs, member
data, narratives, documents, or tenant identifiers. The live DB path uses
`dbAdmin.execute(...)` as a read-only system aggregate so configured
`DATABASE_URL_RLS` tenant context cannot hide rows from the inventory.

## Classification

The report classifies aggregate rows into four categories:

| Category                    | Meaning                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `valid`                     | Lifecycle pair is recognized and maps back to legacy `status`.        |
| `invalid_lifecycle_pair`    | Both lifecycle fields are present but are not a recognized pair.      |
| `null_incomplete`           | `status` or at least one lifecycle field is null.                     |
| `status_lifecycle_mismatch` | Lifecycle pair is recognized but maps to a different legacy `status`. |

Local live aggregate proof against the default local DB after the admin/system
read-path fix:

```json
{
  "byCategory": {
    "valid": 0,
    "invalid_lifecycle_pair": 0,
    "null_incomplete": 121,
    "status_lifecycle_mismatch": 0
  },
  "total": 121,
  "groups": [
    {
      "category": "null_incomplete",
      "status": "court",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 1
    },
    {
      "category": "null_incomplete",
      "status": "evaluation",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 27
    },
    {
      "category": "null_incomplete",
      "status": "negotiation",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 9
    },
    {
      "category": "null_incomplete",
      "status": "resolved",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 8
    },
    {
      "category": "null_incomplete",
      "status": "submitted",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 59
    },
    {
      "category": "null_incomplete",
      "status": "verification",
      "caseLifecycleState": null,
      "recoveryLifecycleState": null,
      "count": 17
    }
  ]
}
```

Reviewer-shape proof from `--from-json` with all categories populated:

```json
{
  "byCategory": {
    "valid": 3,
    "invalid_lifecycle_pair": 2,
    "null_incomplete": 1,
    "status_lifecycle_mismatch": 4
  },
  "total": 10
}
```

The checked-in formatter and focused tests preserve the output shape even when a
reviewer chooses to validate classification without a live database.

## Runtime Dependency Map

The existing status-writer guard remains the authoritative writer baseline:

```bash
node scripts/check-claim-status-writers.mjs
# Claim status writer inventory guard passed (13 writers).
```

Current command dependencies on `claims.status`:

| Dependency class          | Evidence path                                                                                | Current dependency                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Transition current-state  | `packages/domain-claims/src/claims/transition-read-context.ts`                               | Reads `claims.status` with `claims.lifecycle_version` as the transition guard input.                |
| Status CAS                | `packages/domain-claims/src/claims/transition.ts`                                            | Updates use `eq(claims.status, current.status)` plus lifecycle-version CAS before side effects.     |
| Transition writes         | `packages/domain-claims/src/claims/transition.ts`                                            | Persists `status: toStatus` and dual-writes mapped lifecycle states on status-changing transitions. |
| Initialization writes     | `packages/domain-claims/src/claims/create.ts`, `packages/domain-claims/src/claims/submit.ts` | New claims still initialize legacy `status` with mapped lifecycle fields.                           |
| Status-shaped fixtures    | `scripts/check-claim-status-writers.mjs` fixture allowlist                                   | Seed, pilot, E2E, and DB-test fixtures still construct or upsert claims through status-shaped data. |
| Seed upsert compatibility | `packages/database/src/seed-full/claims.ts`, `packages/database/src/seed-golden/claims.ts`   | Fixture upserts write status values and must be migrated or isolated before status removal.         |
| Workflow seed pack        | `packages/database/src/seed-packs/ks-workflow-pack.ts`                                       | Workflow pack upserts status-shaped claim rows for pilot/E2E scenarios.                             |

## Deprecation Route

Before future destructive `T-503`, command paths need a compatibility-free
transition model:

1. Add a lifecycle-current-state read contract that returns
   `case_lifecycle_state`, `recovery_lifecycle_state`, and `lifecycle_version`
   without requiring `claims.status` for authorization.
2. Move transition validation from `from status -> to status` to lifecycle-pair
   inputs, or define an equivalent command DTO that never treats legacy status
   as the source of truth.
3. Replace status CAS with lifecycle-pair CAS plus lifecycle-version CAS:
   expected case state, expected recovery state, and expected lifecycle version.
4. Keep status dual-write only as temporary compatibility while read/write
   clients migrate, then prove no command, seed, pilot, E2E, or fixture path
   needs status-shaped input.
5. Update initialization and fixture factories to construct lifecycle states
   directly, with any status DTOs derived only at compatibility edges.
6. Add focused transition conflict tests that prove stale lifecycle-pair CAS is
   rejected before side effects, audit rows, or domain events are recorded.

This route requires a separately promoted implementation slice because it
touches runtime command semantics and likely protected verification surfaces.

## Rollback Boundary And Handoff Criteria

`T-503a` is rollback-safe because it only adds read-only inventory/report code
and this evidence document. Reverting the script and report restores the prior
state without data changes.

Future destructive `T-503` remains blocked until all criteria below are true:

- qualifying post-`T-202` release-cycle proof exists;
- live lifecycle inventory is either clean or paired with an approved repair
  plan for invalid, incomplete, and mismatch categories;
- transition current-state reads and CAS no longer depend on `claims.status`;
- initialization, seed, pilot, E2E, and DB-test fixture paths no longer require
  status-shaped claim rows;
- rollback/backfill/data-repair plan is approved and tested;
- observability exists for lifecycle mismatch rate, transition conflict rate,
  and any compatibility fallback during rollout;
- schema/RLS/destructive migration work is separately reclassified and promoted.
