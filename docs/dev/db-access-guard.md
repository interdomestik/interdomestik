---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-08
---

# DB Access Guard Contributor Playbook

> Status: Archived implementation support note. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

`pnpm check:db-access` scans direct Drizzle access outside approved database internals and
compares it with `scripts/ci/db-access-baseline.json`. The guard prevents new sensitive
direct DB access from entering the repo without review.

## Posture Categories

| Posture            | Meaning                                                                                         | Contributor action                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tenant-context`   | The DB call uses the transaction alias supplied by `withTenantContext` or `withTenantDb`.       | Preferred for new tenant-scoped writes and high-risk reads.                                |
| `tenant-predicate` | The DB call has a same-statement tenant predicate using `withTenant(...)` or `eq(...tenantId)`. | Acceptable for reviewed reads. New writes should move to `withTenantContext`.              |
| `admin-privileged` | The DB call uses the explicit privileged Drizzle client, `dbAdmin`.                             | Use only for intentionally privileged maintenance/admin paths.                             |
| `system-exempt`    | The call is immediately preceded by a reviewed `db-access-guard` directive with a reason.       | Use only for cron, webhook, seed, migration, or maintenance scope with rationale.          |
| `unclassified`     | No recognized tenant context, tenant predicate, privileged client, or system directive.         | New entries fail. Move the call or add reviewed posture evidence before updating baseline. |

Canonical reason strings are stable for grep and dashboards:

- `tenant-context: callback-tx-alias`
- `tenant-context: callback-tx-block`
- `tenant-predicate: in-where-clause`
- `admin-privileged: dbAdmin`
- `system-exempt: directive`
- `unclassified: no-recognized-context`

## Fixing A Guard Failure

For a new tenant-scoped write, wrap the work in `withTenantContext` or `withTenantDb` and use
the callback transaction alias:

```ts
await withTenantContext({ tenantId }, async tx => {
  await tx.update(claims).set(values).where(eq(claims.id, claimId));
});
```

For a reviewed read that already has a tenant predicate, keep the tenant condition in the
same statement as the DB call:

```ts
return db
  .select()
  .from(claims)
  .where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
```

Split-statement predicates intentionally stay unclassified:

```ts
const scope = eq(claims.tenantId, tenantId);
return db.select().from(claims).where(scope);
```

For a system path, use the directive immediately above the DB call only after reviewer sign-off:

```ts
// db-access-guard: system-exempt -- reason: cron iterates tenants from sealed list
await db.update(claims).set({ status: 'archived' });
```

The reason is reported separately; do not encode free-form rationale into
`tenantPostureReason`.

## Baseline Updates

Run the guard before touching the baseline:

```bash
pnpm check:db-access
```

Only regenerate the baseline when the DB access posture change is intentional and reviewed:

```bash
node scripts/check-db-access-guard.mjs --write-baseline
```

Reviewers should inspect `tenantPosture`, `tenantPostureReason`, and count deltas before
accepting a baseline update. Do not remove `check:db-access` from `check:all` or `pr:verify`.
