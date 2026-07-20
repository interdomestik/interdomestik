# IDA-DG19-A2a1a1a — P0a1a1a Live Migration Ledger Prefix Inspection Gate

Status: exact external review packet only; not repository authority; not promoted.

## 1. Classification, authority and decision boundary

Classified as `promotion/design-gate` Tier 0 because this packet proposes future
scope but changes no repository, source, test, database, provider or deployment
state. The prospective implementation is Tier 3 because it would inspect live
migration catalog and ledger state on an administrative PostgreSQL session.

Gate ID: `IDA-DG19-A2a1a1a`.
Sole proposed implementation slice: `IDA-UI03a2-P0a1a1a`.
Clean authority base: `fc3f948f42e1e5f509882e6554dbc132d4e3eac8`.

Canonical `current-program.md` Rev 146 and `current-tracker.md` close
`IDA-UI03a2-P0a1a0b` and promote no replacement. Therefore this packet cannot
authorize runtime work by itself. It is eligible only for an explicit docs-only
promotion request after one valid exact-packet architecture/contracts-security
PASS and orchestrator acceptance.

Accepted predecessors are immutable inputs:

- P0a1a0a canonical corpus capability: gate SHA-256
  `b85accc78ae562b673bcec72cd12dff4ca22f7b4cfa1404027d9f0ff554cffb8`;
- P0a1a0b callback-plan capability: gate SHA-256
  `a5ffbb84f90b9c58bd840e7b171f5bc19506b4adb91beb46fe37029c84ec5c54`;
- merged callback plan: Drizzle ORM `0.45.2`, 93 migrations, 750 SQL chunks,
  843 flat callback items, plan SHA-256
  `f4486654346a7e7c66a5cdbff57f4611268b1c5144e0ab7cea3ac3a1b7e2ab3f`;
- P0a0b reserved-session preflight remains the only permitted future connection
  entry point and is not modified here.

## 2. Smallest outcome

Build one inert internal live-ledger inspection seam which, when separately
runtime-authorized later, accepts one authentic `MigrationCallbackPlanCapability`,
one already reserved `postgres.ReservedSql`, and one `AbortSignal`; opens a bounded
read-only transaction; obtains one fixed transaction advisory lock; validates the
exact Drizzle namespace/table/sequence ownership and catalog shape when present;
and proves that every recorded ledger row is exactly a prefix of the authenticated
93-migration plan.

Success returns only a frozen redacted summary. The block below is an illustrative
field contract, not a YAML/text serialization format:

```text
contract_version: canonical_migration_ledger_inspection_v1
ledger_state: schema_absent | table_absent | exact_prefix | all_applied
applied_migrations: integer 0..93
pending_migrations: integer 93..0
callback_plan_sha256: f4486654...ab3f
read_only: true
execution_authorized: false
```

This summary is observational, not a capability to execute SQL. No current
production caller or package-root export is added. A later execution slice must
rebuild/revalidate the corpus and callback plan, reacquire the same lock, rerun
catalog and prefix inspection inside its own execution transaction, independently
recapture the exact pending callback suffix, and obtain separate promotion.

Primary user/workflow: the internal migration operator prerequisite, not an end
user. Business outcome: fail closed on ambiguous or poisoned migration-ledger state
before any migration execution can later be authorized. Entry point: an already
preflighted reserved administrative session. Exit state: redacted inspection result
with the database unchanged.

## 3. Hard exclusions

This slice does not authorize or touch:

- migration SQL execution, callback invocation, callback suffix materialization,
  callback recapture/equality, bootstrap DDL, ledger INSERT/UPDATE/DELETE, schema
  creation, table creation, repair, backfill or mutation of any kind;
- `packages/database/src/migrate.ts`, `packages/database/src/db.ts`, package-root
  exports, package scripts, CLI/runner wiring, workflows, Docker/compose files,
  current migrations, `_journal.json`, snapshots or generated schema artifacts;
- retained, default, frozen, shared, remote or provider databases; provider contact;
- roles, role memberships, owners, ACLs, GRANT/REVOKE, RLS policies or tenant data;
- `apps/web/src/proxy.ts`, canonical routes, auth/session/OTP/tenancy/RLS
  architecture, protected app surfaces, UI, i18n, billing or clarity markers;
- deployment, rollout, staging/production aliases, CD or production evidence;
- P0, P0a2, frozen parent UI03a2, P0a1a1b or any successor execution authority.

Production SQL is limited to transaction control, fixed `SET LOCAL`, one fixed
advisory-lock call, fixed `pg_catalog`/information reads and one bounded qualified
ledger SELECT. Test-only DDL may arrange disposable PostgreSQL 16 states and is
never imported by production.

## 4. Input authority and transaction contract

1. Authenticate the callback-plan value with the existing direct-file
   `readMigrationCallbackPlanState` before issuing SQL. A forged, cloned, proxied,
   stale-shape or missing capability returns
   `MIGRATION_LEDGER_PLAN_CAPABILITY_REJECTED` with zero SQL calls.
2. The function accepts no environment, URL, schema/table name, query fragment,
   digest, expected rows, lock key, timeout or callback items from its caller.
3. Reject a pre-aborted signal before SQL. During SQL, cancellation/connection
   teardown remains owned by the existing P0a0b wrapper; this seam checks the
   signal between every awaited phase and never suppresses abort.
4. On the supplied reserved session issue exactly one
   `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`.
5. Apply fixed local settings: `search_path = pg_catalog, pg_temp`,
   `lock_timeout = '2s'`, `statement_timeout = '5s'`, and
   `idle_in_transaction_session_timeout = '5s'`.
6. Acquire `pg_advisory_xact_lock(673167055, -773281837)`. Those two signed int32
   constants are the first eight SHA-256 bytes (`281fb6cfd1e8a7d3`) of
   `interdomestik:migration-ledger-inspection:v1`. No caller chooses them. The lock
   serializes only cooperating future Interdomestik migration operations; database
   owners, superusers and legacy Drizzle callers remain an explicit trust boundary.
7. Run catalog and ledger inspection in the same snapshot and backend PID. Recheck
   PID immediately before commit. Commit success once. On any rejection/error/abort,
   attempt rollback once; cleanup failure is separately redacted.
8. The runtime `READ ONLY` transaction enforces no mutation. Separately, a static
   boundary AST/text test fails the implementation if production source contains
   `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `CREATE`, `ALTER`, `DROP`,
   `GRANT`, `REVOKE`, `COPY`, `CALL`, `DO`, `VACUUM`, `ANALYZE` or any migration/
   callback invocation. This source test is defense in depth, not runtime parsing.

## 5. Exact catalog states

Only the quoted namespace `drizzle`, table `__drizzle_migrations`, sequence
`__drizzle_migrations_id_seq` and the authenticated plan are valid.

### `schema_absent`

The exact namespace is absent and neither reserved relation name resolves. Return
applied 0, pending 93. This does not authorize bootstrap.

### `table_absent`

The namespace exists, is owned by `current_user`, grants no CREATE privilege to
PUBLIC or a non-owner role, and neither the table nor its reserved sequence exists.
Return applied 0, pending 93. A foreign-owned namespace, orphan table/sequence or
non-owner CREATE grant fails closed. This does not authorize bootstrap.

### table present

Require all of the following in one fixed catalog read:

- namespace, ordinary permanent non-partitioned table and serial sequence are all
  owned by `current_user`; no same-name view/materialized view/foreign/partitioned
  relation is accepted;
- table has exactly three user columns in order:
  `id int4 NOT NULL`, `hash text NOT NULL`, `created_at int8 NULL`;
- `id` has exactly the canonical serial `nextval` default, is the sole-column
  primary key, and the sequence is owned by `id`; `hash` and `created_at` have no
  defaults or generated/identity expressions;
- there are no extra columns, constraints, indexes, user triggers, rewrite rules,
  row-security policies, RLS/forced-RLS flags or partition attachments;
- no PUBLIC or non-owner role has schema CREATE, table INSERT/UPDATE/DELETE/TRUNCATE
  or sequence USAGE/UPDATE through explicit ACL entries. Implicit superuser,
  database-owner and role-membership powers cannot be disproved here and remain a
  stated administrative trust boundary;
- catalog ambiguity, duplicate namespace/relation resolution, null/unexpected
  metadata or unavailable catalog proof fails closed.

This is the Drizzle ORM 0.45.2 PostgreSQL ledger shape already source-bound by
P0a1a0b: `id SERIAL PRIMARY KEY`, `hash text NOT NULL`, `created_at bigint`.

## 6. Exact prefix contract

After catalog acceptance, issue one qualified bounded ledger read equivalent to:

```sql
SELECT id::text,
       CASE WHEN octet_length(hash) = 64 THEN hash ELSE NULL END AS hash,
       created_at::text
FROM "drizzle"."__drizzle_migrations"
ORDER BY id ASC
LIMIT 94
```

The limit proves overflow without transferring an unbounded ledger. Do not require
contiguous serial IDs because PostgreSQL sequences are non-transactional and a
rolled-back insert may leave a safe numeric gap. Require each ID to be a positive
int4 and strictly increasing. For row index `i`, require `hash` and `created_at` to
equal authenticated callback-plan migration `i` exactly. `created_at` is compared
as canonical decimal text; no float conversion, timestamp inference or
`last-created_at` shortcut is permitted. Reject SQL NULL `created_at`; render each
positive safe-integer plan `folderMillis` as exact base-10 text, so plan-side null is
not representable.

Accept only 0 through 93 rows. This exact ordered comparison rejects duplicate,
unknown, future, missing-middle, reordered, malformed, null, overlong and
non-prefix ledgers. Zero through 92 rows returns `exact_prefix`; 93 returns
`all_applied`. The summary exposes counts and the already-public plan digest only,
never SQL, paths, dependency hashes, ledger hashes, row IDs, role names or errors.

## 7. Exact future file and size map

Production, all new and each strictly below 150 physical lines:

1. `packages/database/src/migration-ledger-contracts.ts` — max 110 lines; fixed
   result/error/catalog-row types and redacted summaries.
2. `packages/database/src/migration-ledger-prefix.ts` — max 125 lines; pure exact
   bounded-row validation against authenticated owned migrations.
3. `packages/database/src/migration-ledger-catalog.ts` — max 149 lines; fixed
   catalog and ledger reads plus total catalog-shape classification; no transaction
   ownership and no dynamic SQL.
4. `packages/database/src/migration-ledger-inspection.ts` — max 149 lines; sole
   callback-plan unwrap consumer for this slice, transaction/timeout/lock/abort/
   commit/rollback orchestration and stable error mapping.

Tests/support, all new and each max 149 physical lines:

5. `packages/database/test/migration-ledger-prefix.test.ts` — pure exhaustive prefix
   and malformed-row matrix, including safe non-contiguous IDs.
6. `packages/database/test/migration-ledger-inspection.test.ts` — disposable PG16
   positive states: schema absent, owned schema/table absent, empty table, prefixes
   1 and 92, all 93, same PID and database unchanged.
7. `packages/database/test/migration-ledger-inspection-faults.test.ts` — owner, ACL,
   shape, trigger/policy/index, overflow, lock-timeout, abort and cleanup failures.
8. `packages/database/test/migration-ledger-inspection.support.ts` — test-only state
   arrangement and catalog snapshots, reusing the existing disposable
   `admin-connection-preflight.support.ts` fixture without modifying it.

One existing test may change but must remain at or below 149 physical lines:

9. `packages/database/test/migration-callback-boundary.test.ts` — add the four new
   production files to its governed scan and allow exactly one new production
   `readMigrationCallbackPlanState` consumer:
   `migration-ledger-inspection.ts`. It must continue proving no package export,
   migrate.ts import, runtime caller, provider/network client or callback execution.

Conditional metadata only: `scripts/repo-size-budget.json` may change only if
`node scripts/repo-size-budget-sync.mjs --check` proves tracked-inventory drift.
No other file is permitted. Ceiling: 4 production files, 4 new test/support files,
1 existing no-overflow boundary test, at most 1 conditional metadata file, 1,278
allocated physical lines, one backend outcome and two engineering days. Stop for a
new gate if any ceiling or file boundary cannot hold.

## 8. Stable failures and rollback

Only these redacted codes may escape:

- `MIGRATION_LEDGER_PLAN_CAPABILITY_REJECTED`
- `MIGRATION_LEDGER_ABORTED`
- `MIGRATION_LEDGER_TRANSACTION_FAILED`
- `MIGRATION_LEDGER_LOCK_TIMEOUT`
- `MIGRATION_LEDGER_CATALOG_REJECTED`
- `MIGRATION_LEDGER_OWNER_REJECTED`
- `MIGRATION_LEDGER_ACL_REJECTED`
- `MIGRATION_LEDGER_SHAPE_REJECTED`
- `MIGRATION_LEDGER_PREFIX_REJECTED`
- `MIGRATION_LEDGER_CLEANUP_FAILED`

Stage, not provider message text, determines classification. Returned/inspected
values and logs contain no SQL, hash rows, URLs, hosts, ports, database/schema/role
names, paths, stack, errno, provider response, raw exception or timing detail. No
console logging is added.

Because production is read-only, rollback means rollback/connection cleanup and
code revert only; there is no data repair. If cleanup cannot be proven, fail closed
with the cleanup code and let P0a0b tear down the reserved session. Cleanup failure
intentionally masks the primary code; this inert, log-free slice accepts that
diagnostic loss, and the later runner gate must revisit operator diagnostics. A
later executor must be removed before these validator modules can be removed.

## 9. Acceptance evidence

C01 forged callback capability causes zero SQL and the exact capability failure.

C02 static boundary proof shows no package export/runtime caller and exactly one
production callback-plan unwrap consumer.

C03 production source contains only fixed queries and the allowed read-only command
set; no dynamic identifier/string query, unsafe SQL, DDL/DML or callback invocation.

C04 disposable PostgreSQL 16 proof runs only through
`withPreflightedAdminConnection` on its reserved owner session, random loopback port
and randomly named scratch database; the existing fixture container is force-removed
and no default/retained/provider database is reachable from the test contract.

C05 schema-absent and owned-schema/table-absent states return 0/93 without mutation;
foreign owner, non-owner CREATE ACL and orphan reserved relation fail.

C06 canonical empty table, prefix lengths 1 and 92, and all 93 return exact redacted
summaries; pre/post catalog snapshots and ledger row counts are unchanged.

C07 pure matrix rejects row 94, duplicate/reordered/unknown/missing-middle/future
entries, malformed/null/overlong hash, wrong created_at and unsafe IDs; a positive
strictly increasing non-contiguous serial-ID sequence passes.

C08 table-shape matrix rejects wrong relkind/persistence/owner, missing/wrong/extra
column, wrong nullability/type/default, identity instead of serial, wrong sequence
ownership, extra constraint/index, user trigger/rule/policy and RLS flags.

C09 explicit non-owner DML/sequence ACLs fail; test teardown restores only the
disposable fixture and production never changes ACLs.

C10 two sessions contending on the fixed advisory key serialize or reach the bounded
lock timeout; no indefinite wait. Abort before SQL and abort while waiting/querying
produce an abort/outer preflight failure with no retained session or transaction.

C11 every error and cleanup path is redacted under `JSON.stringify`, `inspect` and
`String`; injected sentinels never escape.

C12 focused type, unit/live, boundary, DB-access, modularity, journal-integrity,
repo-size and diff checks pass. A future Tier 3 implementation PR still requires
the gate plan plus `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, current-
head CI/security/Sonar/reviewer evidence and human approval. This design/review turn
runs no database or heavyweight gate and claims no runtime readiness.

## 10. Platform, security and operations assessment

Data ownership/tenancy/authz/RLS: the ledger is global administrative metadata and
contains no tenant, identity, membership, claim, PII or billing data. No app role or
tenant context is accepted. Existing auth, tenancy, proxy and RLS contracts are
unchanged. The already-preflighted database owner and other superusers remain the
explicit highest trust boundary.

Resilience/concurrency: fixed local timeouts, one fixed xact lock, one repeatable-read
snapshot, a 94-row cap, read-only enforcement and rollback-on-failure bound work and
prevent partial data changes. The lock cannot serialize legacy/non-cooperating or
superuser writers; that is why this result never grants execution and the successor
must immediately revalidate.

Performance/cost: O(93), at most one bounded catalog result and 94 compact ledger
rows, no cache/background job/network/provider/model cost. Expected local latency is
under 100 ms absent lock contention; the hard statement timeout is 5 s. No product
KPI or user-visible workflow is claimed.

Observability/support: the caller sees stable safe codes and the frozen count/state
summary only. No new logs, metrics, alerts, admin UI or runbook are justified for an
inert internal prerequisite. A future runner gate owns operator diagnostics and
incident behavior.

UI/UX advisory: this packet changes no UI, UX, workflow, copy, accessibility or
operator screen and is classified as a backend protected prerequisite, so it does
not create a new UI benchmark. No contemporaneous Arben UI/UX approval receipt is
claimed. If the orchestrator elects to classify this gate as UI/UX governance, the
benchmark/approval checker becomes an additional promotion blocker.

## 11. Successor boundary and rejected alternatives

After P0a1a1a is implemented and closed, no successor is automatic. A separately
hash-bound `IDA-UI03a2-P0a1a1b` design may propose bootstrap plus immediate corpus/
source/callback revalidation, pending callback suffix equality and exactly-once
same-session transaction execution. It must consume these validation internals only
under new authority, acquire the same
`pg_advisory_xact_lock(673167055, -773281837)`, and rerun them inside the execution
transaction.

Rejected here:

- full same-session execution kernel: too dense and already NON_PASS/non-reviewed;
- bootstrap plus validation: mixes mutation with inspection and complicates rollback;
- last-created_at only: inherits Drizzle's weak pending selection and misses history;
- contiguous serial IDs: rejects safe gaps left by rolled-back sequence allocation;
- returning SQL-bearing/pending capability: creates premature execution authority;
- trusting an earlier inspection during later execution: admits a race;
- provider/live proof: outside authority;
- modifying migrate.ts or exporting a new runner: belongs to P0a2/later authority.

## 12. Required review disposition

Review this exact packet read-only as both:

1. architecture reviewer: smallest coherent prerequisite, source/file feasibility,
   same-session successor seam, modularity, concurrency and scope integrity; and
2. contracts/security reviewer: input authority, catalog/owner/ACL shape, exact
   prefix semantics, read-only/no-mutation proof, redaction, abort/cleanup, abuse and
   exclusions.

A valid response must state `ARCHITECTURE: PASS|NON_PASS`,
`CONTRACTS_SECURITY: PASS|NON_PASS`, list blocker findings first with section
references, and state one `OVERALL: PASS|NON_PASS`. Silence, a tool-call stub,
partial commentary, timeout, quota/access failure or review of a different hash is
NON_PASS. A PASS is advisory evidence for an explicit docs-only promotion request;
it never promotes the slice or authorizes source/test/runtime/DB work.
