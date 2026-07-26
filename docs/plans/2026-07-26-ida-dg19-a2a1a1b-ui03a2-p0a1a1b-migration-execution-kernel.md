---
plan_role: input
status: draft
source_of_truth: false
slice: IDA-DG19-A2a1a1b
proposed_implementation_slice: IDA-UI03a2-P0a1a1b
owner: platform + security + database + qa
date: 2026-07-26
last_reviewed: 2026-07-26
---

# IDA-DG19-A2a1a1b — Same-Session Migration Execution Kernel Gate

> Status: exact current-authority proposal only. This packet promotes no
> implementation. `IDA-UI03a2-P0a1a1b` remains blocked until this exact file is
> reviewed and explicitly accepted, the canonical docs-only gate merges, clean
> then-current main resolves only that slice, AI OS is refreshed, and a separate
> exact runtime-authority receipt is accepted.

## Decision

Prepare exactly one prospective Tier 3 backend prerequisite after completed
`IDA-UI03a2-P0a1a1a`: an internal same-session migration execution kernel that
revalidates the already-authenticated corpus and callback plan, proves the live
ledger is an exact prefix, selects the exact pending suffix, executes it once in
one locked transaction, revalidates before commit, and returns only a frozen
redacted summary.

This is the next sequential prerequisite in the accepted chain:

`P0a1a1a (complete) → P0a1a1b (this proposal) → P0a2 → frozen P0`.

It is not authority for `P0a2`, `P0`, parent `IDA-UI03a2`, any public migration
runner, any provider contact, or any application/product work.

## Classification

- Gate work: Tier 0 because only this packet and canonical program/tracker
  authority are proposed.
- Future implementation: Tier 3 because it would execute schema migrations,
  create administrative ledger objects when absent, hold an advisory lock, and
  depend on database ownership and ACL posture.
- Current implementation authority: false.
- Current database/provider/deployment authority: false.

## Bound authority and evidence

| Authority           | Evidence                                                                                                                                                                            | Disposition                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Clean base          | `main` and `origin/main` both `bf350cdafaa1b4603f915404f71fc82b0652db81`; tree `6bcd4ffd73fc8ab6825aa43b526f40b0a30ce414`                                                           | Binding design base.                                                                                                         |
| Resolver            | `blocked_requires_current_authority`, `activeSlice=null`                                                                                                                            | Binding; no runtime slice exists.                                                                                            |
| `P0a0a`             | PR `#1382`, merge `b4b4ee5c…`                                                                                                                                                       | Complete connection-config capability.                                                                                       |
| `P0a0b`             | PR `#1385`, merge `72a4ee80…`                                                                                                                                                       | Complete one-owner/one-reserved-session preflight; provider readiness still NON-PASS.                                        |
| `P0a1a0a`           | PR `#1388`, merge `aebcfb22…`                                                                                                                                                       | Complete authenticated 93-migration corpus capability.                                                                       |
| `P0a1a0b`           | PR `#1391`, merge `1871fd24…`                                                                                                                                                       | Complete exact Drizzle `0.45.2` callback-plan capability: 93 migrations, 750 chunks, 843 callback items, digest `f4486654…`. |
| `P0a1a1a`           | PR `#1394`, merge `3acee0a2…`                                                                                                                                                       | Complete read-only catalog, owner, ACL and exact-prefix inspection with `execution_authorized:false`.                        |
| Drizzle source      | Current locked and hash-bound `pg-core/dialect` source; current official source documentation confirms one transaction around all pending PostgreSQL migrations and ledger inserts. | Design input; the repo's authenticated sources and tests remain stronger.                                                    |
| AI OS               | Observation `1407fb1205cc6ae5204096597e7f7d8b35a4d8200fa9d7bed3fedde0bdde670a`: authority current, active none, runtime not authorized.                                             | Advisory and aligned.                                                                                                        |
| Brain/Obsidian/Wiki | Brain snapshot freshness and session integrity drift are NON-PASS; Obsidian/Wiki remain orientation only.                                                                           | Never product or runtime authority.                                                                                          |

The preserved branch `codex/ida-ui03a2-p0-implementation` is not reusable
implementation authority. Its single commit `b658dcb…` is based on
`46878f2b…`, spans thirteen paths, predates the completed prerequisite chain,
and exceeds the accepted P0 `6/2/1.5` envelope. It must not be rebased, merged,
cherry-picked, cleaned, reset or used as the implementation base here.

## Prospective outcome

### Entry

The internal caller already holds:

1. a genuine `MigrationCallbackPlanCapability`;
2. one `postgres.ReservedSql` accepted by
   `withPreflightedAdminConnection`;
3. the same live `AbortSignal`.

No URL, environment object, credentials, tenant/session data, raw migration
folder, SQL list, callback list, schema/table identifier, ledger count, or
caller-selected migration is accepted by the kernel.

### Transaction contract

The kernel must:

1. authenticate the exact capability with the existing prototype-plus-`WeakMap`
   `readMigrationCallbackPlanState` reader and reject a forged or stale value
   before issuing SQL;
2. on the reserved session, call fixed
   `pg_try_advisory_lock(673167055, -773281837)` and record the backend PID in
   the same statement; contention fails immediately before `BEGIN`;
3. while that session lock is held, begin one `REPEATABLE READ` read-write
   transaction, so its first MVCC snapshot cannot predate lock acquisition;
4. set `search_path = pg_catalog, pg_temp`, `lock_timeout = '10s'`,
   `statement_timeout = '60s'`, and
   `idle_in_transaction_session_timeout = '30s'` with fixed `SET LOCAL`
   statements;
5. recheck the backend PID, validate through qualified `pg_catalog` reads that
   `public` is the single ordinary schema, is owned by `current_user`, and
   grants no `CREATE` to any non-owner, then and only then set
   `search_path = pg_catalog, public, pg_temp`;
6. while the lock and transaction are held, rebuild the authentic corpus and
   callback plan and require exact equality with the input plan digest,
   migration metadata, callback offsets, callback items and dependency hashes;
7. inspect the Drizzle catalog and exact ledger prefix using the merged
   P0a1a1a validators;
8. if and only if the authenticated catalog state is `schema_absent` or
   `table_absent`, create the exact canonical `drizzle` schema and/or
   `__drizzle_migrations` serial ledger, then immediately rerun the complete
   owner/ACL/shape inspection;
9. derive the pending callback suffix only from the validated applied count
   and `entryOffsets`; never use Drizzle's historical last-created-at-only
   selection;
10. execute each bounded callback item sequentially through the reserved
    session, checking abort before and after every item;
11. re-read the ledger and require `all_applied` with all 93 exact ordered
    hash/timestamp pairs;
12. rebuild and compare the corpus/callback plan again after execution and
    before commit, so source or corpus drift rolls back the transaction;
13. recheck backend PID and abort state, commit once, call fixed
    `pg_advisory_unlock(673167055, -773281837)` on that same PID, and require
    exactly one successful unlock before returning a frozen redacted summary.

Any failure after `BEGIN` rolls back. Every path after successful lock
acquisition attempts exactly one fixed unlock, including `BEGIN`, rollback and
commit failures. Rollback or unlock failure dominates the original error as
`MIGRATION_EXECUTION_CLEANUP_FAILED`; the P0a0b wrapper then closes the reserved
client, which releases any surviving session lock. No partial success or pending
suffix is returned.

### Exact success summary

The only success data is:

```text
contract_version: canonical_migration_execution_v1
callback_plan_sha256: f4486654…
applied_before: integer 0..93
applied_now: integer 0..93
applied_total: 93
session_reserved: true
transaction_committed: true
session_lock_released: true
execution_completed: true
```

It contains no SQL, paths, credentials, endpoint, CA, PID, role, database name,
schema contents, tenant/member/claim data, exception text or provider detail.

## Failure and abuse contract

Stable codes must distinguish:

- rejected capability or rebuilt-plan drift;
- abort before mutation, during callback execution, or before commit;
- transaction, timeout, session-lock contention/unlock or session-change
  failure;
- unsafe `public` schema owner/ACL/search-path posture;
- ledger owner, ACL, shape, prefix or post-execution rejection;
- bootstrap failure;
- callback execution failure;
- cleanup failure.

Every code and summary must stay redacted through `String`, `inspect`,
`JSON.stringify`, nested causes, cleanup errors and injected sentinel values.
No log, telemetry, metric, audit row or console output is added.

The plan contains 843 bounded callback items and at most 1 MiB of authenticated
SQL. The kernel may not concatenate them, parallelize them, skip ledger insert
items, retry an item, accept dynamic identifiers, call an app/runtime role, or
continue after abort. PostgreSQL transaction rollback is the only mutation
recovery mechanism.

## Exact future writer map

After a separate accepted runtime receipt only:

### Production/config — maximum four

1. `packages/database/src/migration-execution-contracts.ts` — stable types,
   redacted result and fault codes.
2. `packages/database/src/migration-execution-bootstrap.ts` — fixed
   `public`/Drizzle schema and ledger posture/bootstrap statements only.
3. `packages/database/src/migration-execution-plan.ts` — fresh plan rebuild,
   deep equality and exact pending-suffix derivation.
4. `packages/database/src/migration-execution-kernel.ts` — one transaction,
   lock, validation, execution, post-validation, commit/rollback.

### Test/support — maximum four

5. `packages/database/test/migration-execution-kernel.test.ts` — positive
   schema-absent, table-absent, empty-prefix, partial-prefix and all-applied
   PostgreSQL 16 cases.
6. `packages/database/test/migration-execution-faults.test.ts` — abort, lock,
   callback, drift, catalog, ACL, session and cleanup failures.
7. `packages/database/test/migration-execution.support.ts` — fresh no-volume
   disposable fixture and content-free removal receipt.
8. `packages/database/test/migration-callback-boundary.test.ts` — exact new
   private consumers, `.unsafe` sole-use boundary and line/file ceilings.

### Deterministic only

9. `scripts/repo-size-budget.json`, only when changed by the unchanged
   repository-size sync generator after all intended paths are staged.

Nine paths is the absolute ceiling. Any fifth production/config path, fifth
test/support path, tenth total path, `migrate.ts`, `package.json`, package
export/script, workflow, Docker/compose, CI, canonical migration/journal,
database client, seed, app, proxy, route, auth/session/OTP, tenancy/RLS,
billing, UI/i18n, provider, deployment, README, AGENTS or architecture-doc
change stops for fresh authority.

Every new source/test/support file must stay below 150 physical lines. The hard
allocation is 1,150 changed lines, 2.5 engineering days and one backend
execution-kernel outcome.

## Test-first and proof plan

The first implementation action is a failing `schema_absent` test proving that
the authenticated 93-migration plan either commits the exact canonical ledger
and database state once or leaves neither schema nor ledger after an injected
callback failure. No production file is edited before that RED receipt.

Focused proof must cover:

- zero, one, 92 and 93 applied migrations;
- schema and table bootstrap with exact owner/ACL/serial shape;
- duplicate/gapped sequence IDs accepted only when ordered rows remain the
  exact hash/timestamp prefix;
- extra, reordered, mismatched, malformed or 94th rows rejected before
  callback execution;
- public/drizzle schema, table, sequence, column ACL and owner violations;
- forged/stale capability, corpus drift and dependency-source drift;
- exact pending offset and no replay of an applied callback;
- failure at the first, middle and last pending item with total rollback;
- abort at pre-BEGIN, pre-bootstrap, mid-callback and pre-commit boundaries;
- advisory-lock contention, statement timeout, session change and rollback
  failure precedence;
- a cooperating writer that commits while this worker waits cannot create a
  stale snapshot because lock contention fails before `BEGIN`; the first
  snapshot-taking read occurs only while the acquired session lock is held;
- lock acquisition followed by `BEGIN` failure, callback failure, rollback
  failure and commit failure each attempt one unlock, while unlock failure
  produces cleanup-failure precedence and P0a0b client closure;
- second invocation after success performs zero callback items and leaves the
  exact 93-row ledger unchanged;
- redaction under every string/inspection path;
- no import/export/caller from `migrate.ts`, package API, application code,
  workflows or P0/P0a2.

Future required gates are focused database tests and type-check, modularity,
DB-access and architecture guards, migration-journal integrity, deterministic
repo-size sync/check after staging, `pnpm pr:verify`, `pnpm security:guard`,
`pnpm e2e:gate`, a diff-scoped security review, Opus 4.8 exact-current review,
and all exact-head CI/Sonar/CodeQL/Secret/security/finalizer contexts. Z620 is
supporting pre-push evidence when relevant, never merge authority. P8
infrastructure certification is not repeated.

## P0a2 and P0 boundary

`P0a1a1b` adds no caller and is inert after merge.

Only a later exact `IDA-UI03a2-P0a2` gate may propose:

- a distinct NOBYPASSRLS/NOSUPERUSER runtime role fixture;
- owner/runtime privilege, membership, default-ACL and ownership manifest;
- PostgreSQL 15 and 16 executable matrix;
- seed/runtime phase propagation;
- package command, workflow/Docker/CI wiring;
- least-privilege proof and any public internal runner.

The P0a1a1b kernel uses PostgreSQL primitives and catalog fields already accepted
by the P0a0b/P0a1a1a contracts for server majors 15 and 16: reserved-session
identity, `pg_try_advisory_lock`/`pg_advisory_unlock`, repeatable-read
transactions, `SET LOCAL`, qualified `pg_catalog` owner/ACL reads, schemas,
tables and serial sequences. This gate makes no PostgreSQL-15 execution
certification claim. The kernel remains inert, and P0a2 must execute the exact
merged kernel and catalog assumptions on both PostgreSQL 15 and 16 before adding
any caller. A version difference is a P0a2 stop requiring fresh authority; it
may not silently expand or rewrite P0a1a1b.

Only after P0a2 merges and closes green may fresh authority replan frozen
`IDA-UI03a2-P0` from then-current main. The old P0 implementation branch remains
evidence only and cannot supply source.

## Protected exclusions and stop conditions

No current source, test, migration, journal, database, provider, workflow,
environment, deploy, production alias or frozen state is touched by this gate.
No tenant, member, claim, draft, document, billing, health or other product data
is read or written.

Stop and return to current authority if review shows:

- the nine-path/1,150-line/2.5-day envelope is not credible;
- safe execution needs `migrate.ts`, package/workflow/Docker wiring or P0a2;
- any callback can escape the one reserved transaction or the session lock
  cannot be acquired before `BEGIN` and reliably released afterward;
- public-schema posture cannot be proved before using it in `search_path`;
- callback/source/corpus equality cannot be rechecked before commit;
- the kernel would expose SQL, identifiers, credentials or raw errors;
- PostgreSQL 15/16 differences must be resolved here rather than in P0a2;
- any default, retained, frozen, remote or provider database is needed;
- any second outcome or successor is requested.

## Current gate blockers

1. This exact file has not received same-hash architecture and
   contracts/security review.
2. Arben has not explicitly accepted this exact path, byte count, SHA-256,
   writer map, ceilings and sole prospective slice.
3. The canonical docs-only promotion PR has not merged.
4. A separate implementation/runtime receipt does not exist.

Until all four are closed, resolver state must remain
`blocked_requires_current_authority`, `activeSlice=null`, and no implementation
branch/worktree, database, provider or deployment action is authorized.
