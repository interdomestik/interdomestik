# IDA-DG19-A2a1a0b — Canonical Drizzle Callback-Plan Binding

Status: DRAFT_ACCEPTANCE_CANDIDATE — NOT PROMOTED
Slice: IDA-UI03a2-P0a1a0b
Human title: authentic corpus to canonical pg-proxy callback-plan binding
Authority base: clean detached origin/main ed514881663e9e902865cc7167ea6d1e8e222fb9
Classification: promotion/design-gate discovery; prospective implementation Tier 3
Runtime authorization: false

## 1. Outcome and stop rule

Build one pure, internal, no-database plan capability. It accepts only an authentic
`MigrationCorpusCapability` produced by the completed P0a1a0a boundary, verifies
the exact installed Drizzle 0.45.2 reader, pg-proxy migrator and `PgDialect`
sources, derives the exact Drizzle reader result from the authenticated canonical
root, constructs the exact full-corpus pg-proxy callback list, and returns an
opaque immutable `MigrationCallbackPlanCapability`.

There is no member-facing behavior and no database, socket, provider or migration
execution. P0a1a1 remains the only slice allowed to inspect live migration-table
state, choose a pending suffix, compare the execution callback, open a transaction
or execute SQL.

Exact entry point:

    async function buildCanonicalMigrationCallbackPlan(
      capability: MigrationCorpusCapability
    ): Promise<
      | Readonly<{ ok: true; capability: MigrationCallbackPlanCapability }>
      | Readonly<{
          ok: false;
          error: Readonly<{ code: MigrationCallbackPlanErrorCode }>;
        }>
    >

Success returns one frozen capability whose JSON and inspection summary is exactly:

    {
      contract_version: "canonical_pg_proxy_callback_plan_v1",
      drizzle_orm_version: "0.45.2",
      journaled_migrations: 93,
      statement_chunks: 750,
      callback_items: 843,
      callback_plan_sha256:
        "f4486654346a7e7c66a5cdbff57f4611268b1c5144e0ab7cea3ac3a1b7e2ab3f"
    }

Failure returns one frozen stable code from section 7. It returns and logs no raw
path, filename, SQL, callback item, hash from an observed value, package-store
location, stack, OS error, environment value or underlying exception.

Stop if this cannot fit the exact decomposed map, every new/touched file ceiling,
one no-DB outcome and three engineering days. Do not collapse it into a monolith,
weaken source/corpus equality, add a raw-root input, or expand into P0a1a1.

## 2. Exact included and excluded scope

Included only:

- authenticate the caller-supplied P0a1a0a capability with its existing private
  WeakMap seam and obtain its canonical `realRoot` only after authentication;
- resolve exactly three Drizzle exported subpaths with `import.meta.resolve`, bind
  the complete source bytes and dynamically import the reader only after binding;
- invoke only Drizzle's generic `readMigrationFiles({ migrationsFolder: realRoot })`;
- validate, copy and deeply freeze the exact 93-entry reader result;
- construct the one flattened full-corpus pg-proxy callback list: every reader
  statement chunk in entry order plus one exact journal insert after each entry;
- bind the exact counts, full callback list and domain-separated digest below;
- re-run the canonical P0a1a0a verifier after the reader pass and require the
  pre/post authenticated corpus identities and digests to match;
- return only a WeakMap-backed opaque plan capability and redacted stable codes;
- focused pure/fake contract tests that contact no database or network.

Explicitly excluded:

- database clients, `ReservedSql`, P0a0b, sockets, DNS, TLS, provider/network
  contact, SQL execution, migration execution, migration-table reads/writes,
  pending selection, equality against live state, transactions, advisory locks,
  bootstrap, commit/rollback/retry or live database proof;
- `packages/database/src/migrate.ts`, package/root scripts, package exports,
  workflows, Docker/compose, current migration SQL, journal or snapshot mutation,
  schema/RLS, roles, grants, ACLs, ownership, memberships, seeds, runtime-role
  fixtures, provider readiness, rollout, deployment or production aliases;
- frozen UI03a2/P0 worktrees, retained P0 containers/databases, default local DB,
  PR #1380 and the contaminated canonical checkout;
- proxy, routes, auth, sessions, OTP, tenancy architecture, UI, accessibility,
  copy/i18n, billing, P0/P0a2 and P0a1a1 implementation;
- accepting a folder, path, URL, digest, journal, names, raw bytes, reader result,
  callback array or serialized capability from a caller.

This slice derives a complete all-93 callback plan only. It does not decide which
entries are pending. The four P0a1a0a excluded legacy orphans remain integrity
checked and non-executable; Drizzle's reader sees only the 93 journal entries.

## 3. Exact dependency and source binding

The package/lock authority is `drizzle-orm` 0.45.2. The complete installed UTF-8
source bytes must hash exactly:

1. `drizzle-orm/migrator` -> `migrator.js`
   `8c5e22b76a6a239e426b659ba999f69b4b312a052e74f533758f876795f6377c`
2. `drizzle-orm/pg-proxy/migrator` -> `pg-proxy/migrator.js`
   `d490ec2106b1a43833a9196ee19fd7add606bc69651f23515dc1aa6fa4875b73`
3. `drizzle-orm/pg-core/dialect` -> `pg-core/dialect.js`
   `a7d7921c939b228a3f1295be5f024a8c264169e368f591c2d29072ffe079b14e`

The three specifiers and hashes are constants, never caller inputs. Resolution
must yield local `file:` URLs with no query or fragment. After `fileURLToPath`,
lexical and real paths must end in the exact three suffixes above and share one
real `drizzle-orm` package root. Each source is read through a bounded no-follow
regular-file handle, with pre/open/post bigint identity equality and a 2 MiB
per-file ceiling. Unsupported `O_NOFOLLOW`, a symlink final component, missing or
extra export, source mismatch, path mismatch, replacement, growth or read/close
error fails closed.

Only after all three bindings pass may production dynamically import the verified
reader file URL. The loaded namespace must contain an own function named
`readMigrationFiles`. Production does not import or execute pg-proxy `migrate` or
`PgDialect.migrate`; their exact source hashes are semantic sentinels. Focused
tests may import the verified pg-proxy migrator and run it only with a pure in-memory
fake whose `execute` methods make no I/O, solely to prove the captured callback
array equals the local canonical builder item-for-item.

The source-byte check cannot make Node module loading atomic against a privileged
local writer. Pre/open/post identity checks, verify-before-dynamic-import, exact
hashes and a post-plan source recheck narrow the race. Repository/dependency-store
write access remains a trust boundary; any requirement for stronger loader
atomicity makes this gate NON_PASS.

## 4. Exact reader and corpus equality contract

The only root comes from:

    readMigrationCorpusState(capability)

`null` fails before dependency resolution. The function accepts no substitute
authority. The input capability stays opaque and is never serialized.

Call the verified Drizzle reader once with the authenticated `realRoot`. Treat its
return as `unknown`; validate and copy rather than trusting provider-owned objects:

- top-level is an array of exactly 93 entries;
- each entry is a non-null object with exactly `bps`, `folderMillis`, `hash`,
  `sql`; no accessor or symbol properties are accepted;
- `bps` is exactly `true`;
- `folderMillis` is a positive safe integer and all 93 values are unique;
- `hash` is lowercase 64-hex and equals `MIGRATION_FILE_HASHES[index]` for indices
  0 through 92;
- `sql` is an array of strings; total chunk count is exactly 750; total raw item
  UTF-8 bytes remain within the inherited 1 MiB corpus ceiling; no item exceeds
  65,536 UTF-8 bytes;
- reader order is bound to the authenticated P0a1a0a `journalNames`; no file name
  is accepted from the reader and no orphan is appended;
- the copied entry, each copied `sql` array, and the 93-entry array are frozen.

After reading and copying, call `verifyCanonicalMigrationCorpus()` once more and
authenticate its returned capability. Pre/post states must have identical
`realRoot`, `journalSha256`, `corpusSha256`, ordered `journalNames`, ordered
`excludedNames`, and root identity fields. Any post verification failure or
inequality is `MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ`.

The post scan proves the canonical corpus is valid again after the generic read.
It does not create an atomic 97-file snapshot across both scans. The exact callback
digest ensures the reader-derived execution semantics are canonical; a privileged
writer able to replace and restore exact bytes remains outside this Node-only
guarantee.

## 5. Complete flattened pg-proxy callback plan

The exact Drizzle 0.45.2 pg-proxy source makes one callback call with one flat
`queriesToRun` list. For the full corpus (no last DB migration), construct in
reader entry order:

1. every string in that entry's `sql` array, unchanged and including empty or
   whitespace-bearing chunks exactly as returned by split;
2. one exact string:

       INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES('${hash}', '${folderMillis}')

There are 750 statement strings plus 93 inserts = 843 callback items. Do not call
this 93 callback batches; it is one flattened callback list. Per-entry offsets may
be retained privately only to let P0a1a1 derive a suffix, but they are not separate
pg-proxy callbacks and cannot change list order.

Canonical serialization is the UTF-8 bytes of `JSON.stringify(callbackItems)` for
the copied flat string array, with no whitespace or newline. Current exact values:

- serialized bytes: 246,041;
- sum of item UTF-8 bytes: 227,222;
- maximum item UTF-8 bytes: 7,933;
- raw serialized SHA-256:
  `e64bacbf140385ab07133aade986063133a906d3d8257a0eb079b2fa03d0142d`.

The authoritative callback-plan digest is SHA-256 over the UTF-8 domain
`interdomestik-pg-proxy-full-callback-plan-v1` followed by one NUL byte and then
the exact canonical serialization:

    f4486654346a7e7c66a5cdbff57f4611268b1c5144e0ab7cea3ac3a1b7e2ab3f

Any count, primitive, order, byte length or digest mismatch returns
`MIGRATION_CALLBACK_PLAN_REJECTED`. The plan stores an owned deeply frozen copy;
it never stores mutable reader arrays.

The callback plan deliberately excludes pg-proxy's schema-create, table-create
and last-migration SELECT calls because those occur outside its callback. P0a1a1
owns their live-state and transaction posture. The bound `PgDialect` source also
executes statements and one journal insert per pending migration, but it does not
define a callback list; this gate does not conflate those two APIs.

## 6. Opaque capability and exact file map

`MigrationCallbackPlanCapability` has no public constructor. Its module owns one
private constructor token and one WeakMap from frozen instances to a deeply frozen
internal state containing only:

- the authenticated real root and exact pre/post corpus binding;
- the frozen 93 copied migration entries and optional frozen entry offsets;
- the frozen 843-item full callback list and exact callback digest;
- the three exact dependency source hashes.

No SQL, path, callback item, migration hash or timestamp is an own property of the
capability. Reflection, spread, clone, proxy, serialization and inspection match
the redacted summary in section 1. Forged, copied, proxied, deserialized,
prototype-tampered or wrong-realm lookalikes fail internal unwrap.

The future internal unwrap is:

    function readMigrationCallbackPlanState(
      value: unknown
    ): Readonly<MigrationCallbackPlanState> | null

It is exported only by direct file import, never the package index. In this slice
only its boundary test may consume it. P0a1a1 may become the one production
consumer only after separate accepted authority.

Future implementation may touch only:

1. `packages/database/src/migration-callback-plan-contracts.ts` (max 125 lines)
   Result/error algebra, reader/owned-plan/dependency/state contracts.
2. `packages/database/src/migration-callback-plan-manifest.ts` (max 80 lines)
   Three specifiers/source hashes, exact counts, byte ceilings and plan digests.
3. `packages/database/src/migration-callback-source-verifier.ts` (max 149 lines)
   Exact resolution, bounded no-follow source reads, pre/post identity and dynamic
   reader import; injected read/resolve seam is internal and test-only.
4. `packages/database/src/migration-callback-plan-builder.ts` (max 149 lines)
   Unknown reader-result validation, owned deep copies, flat list construction,
   count/byte/domain digest equality and optional entry offsets.
5. `packages/database/src/migration-callback-plan-capability.ts` (max 125 lines)
   WeakMap state, token, opaque summary, authentication and internal unwrap.
6. `packages/database/src/migration-callback-plan.ts` (max 125 lines)
   Sole corpus unwrap consumer and canonical entry point; pre/source/reader/post
   orchestration and stable error mapping.
7. `packages/database/test/migration-callback-plan.test.ts` (max 149 lines)
   Current canonical positive result, exact counts/digest, immutability, CWD
   independence, repeated distinct capabilities and pure pg-proxy parity capture.
8. `packages/database/test/migration-callback-source.test.ts` (max 149 lines)
   Three installed sources, missing/changed/replaced/symlink/oversize/close/source
   export failures through an injected no-I/O dependency seam.
9. `packages/database/test/migration-callback-validation.test.ts` (max 149 lines)
   Wrong shape/keys/accessors/symbols/bps/time/hash/chunk/order/count/size/digest,
   input mutation and pre/post corpus mismatch matrix using pure fixtures.
10. `packages/database/test/migration-callback-boundary.test.ts` (max 149 lines)
    Forgery/redaction, direct-import allowlists, dependency/corpus unwrap consumers,
    no DB/network/runtime imports, no package export and all line ceilings.
11. `packages/database/test/migration-callback.support.ts` (max 149 lines)
    Pure reader/dependency/corpus fixtures and fake pg-proxy executor; no DB client.
12. `packages/database/test/migration-corpus-boundary.test.ts` (max 130 lines,
    before 130, after <=130)
    Mechanically extend the existing exact unwrap-consumer assertion to the sole
    callback-plan entry module without increasing this accepted legacy file.
13. `scripts/repo-size-budget.json` only if the unchanged deterministic generator
    requires the tracked-inventory update.

No index/package export, dependency, package script or `src/migrate.ts` change is
allowed. Every new source/test/support file is at most 149 physical lines after
formatting. Maximum allocation is 1,628 lines across six production, five new
test/support and one no-growth existing test, plus conditional deterministic size
metadata; one backend plan outcome; three engineering days. Fewer lines/files are
welcome, but more files, any raised ceiling or added behavior stops.

## 7. Stable failure codes and precedence

Exact public codes:

- `MIGRATION_CALLBACK_CORPUS_CAPABILITY_REJECTED`
- `MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED`
- `MIGRATION_CALLBACK_READER_REJECTED`
- `MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ`
- `MIGRATION_CALLBACK_PLAN_REJECTED`
- `MIGRATION_CALLBACK_CLEANUP_FAILED`

Precedence:

1. unauthentic input fails capability before dependency resolution or I/O;
2. dependency path/source/type/identity/import/recheck failures map dependency;
3. reader throw or invalid return shape/keys/types maps reader;
4. failed/unequal second authentic corpus scan maps changed-during-read;
5. valid-shaped reader output with wrong canonical hash/count/bytes/order/digest
   maps plan;
6. dependency descriptor/iterator close failure maps cleanup and overrides every
   otherwise-returned success/failure;
7. cleanup dominates, then capability, dependency, reader, corpus-changed, plan.

All returned objects and nested errors are frozen. No partial capability is issued.
Unexpected exceptions map to the active phase without returning their text.

## 8. Acceptance evidence and tests

C01 authentic current P0a1a0a capability produces the exact frozen public summary.
C02 plain/copy/clone/proxy/prototype/serialized plan or corpus capability fails.
C03 current installed reader/pg-proxy/dialect sources match the three complete hashes.
C04 dependency resolution is CWD independent and admits only the exact same real
package root/suffixes, bounded regular source identity and expected reader export.
C05 source missing, symlink, replacement, growth, hash/export mismatch and close
failure map redacted codes with no source/path/error leakage.
C06 reader returns exactly 93 valid copied entries, all `bps=true`, unique positive
safe times, first 93 corpus hashes, 750 exact string chunks and no orphan.
C07 pure fixtures reject wrong arrays, objects, keys, accessors, symbols, types,
hashes, timestamps, sizes, order, count and post-call input mutation.
C08 a second authentic corpus scan follows the reader and exact pre/post state
equality is required; deterministic mismatch/failure maps changed-during-read.
C09 the local builder returns 843 items, exact serialized byte counts and both exact
digests; one changed/removed/reordered/extra chunk or insert fails.
C10 exact Drizzle pg-proxy `migrate` with a pure fake empty-last-migration executor
captures one callback list identical item-for-item to the local 843-item list;
the fake makes zero filesystem, socket, network or database calls.
C11 plan capability retains only private deeply frozen owned state and exposes only
the fixed summary; repeated calls return distinct authentic capabilities.
C12 AST/import scan proves the corpus unwrap has exactly the old boundary test plus
the one plan entry consumer, plan unwrap has only its test, arbitrary internal
seams are test-only, and no package index export exists.
C13 production/test imports contain no `postgres`, DB client, `src/migrate`, network,
child process, provider, P0a0b, SQL executor or migration runner except the exact
test-only pg-proxy parity import.
C14 current migration SQL/journal/snapshots, workflows, scripts, schema/RLS/roles,
frozen/default/provider/deployment and protected application surfaces are unchanged.
C15 every new/touched file stays at its exact ceiling; corpus boundary remains no
larger than 130 lines and deterministic size metadata is the only conditional file.

Focused future implementation proof:

    pnpm --filter @interdomestik/database exec tsx --test \
      test/migration-callback-plan.test.ts \
      test/migration-callback-source.test.ts \
      test/migration-callback-validation.test.ts \
      test/migration-callback-boundary.test.ts
    pnpm --filter @interdomestik/database exec tsx --test \
      test/migration-corpus-boundary.test.ts
    pnpm --filter @interdomestik/database type-check
    pnpm check:modularity-guard
    pnpm check:db-access
    pnpm db:migrations:check-journal
    node scripts/repo-size-budget-sync.mjs --check
    pnpm repo:size:check
    git diff --check

Because future implementation is Tier 3, reviewer fixes must precede the AI OS
heavy-job lease and final `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`.
Those inherited gates are regression proof only and do not grant or prove DB work.
Discovery runs no product gate, database, browser or deployment.

Acceptance evidence inventory: there is no durable store, row, event, audit record,
provider state or DB fixture. Evidence is the exact repo source/test diff, three
dependency source hashes, authentic P0a1a0a capability, exact 93/750/843 counts,
callback digest, focused test receipts, mandatory gates and current-head reviews.

## 9. Tier-3 platform, security, operations and rollback

Data ownership/permissions/authz/tenancy/routing: no tenant, user, claim, identity,
session, route, proxy or entitlement data is read or changed. Permission matrix is
unchanged; the capability grants no authority outside process-local module identity.

Schema/migrations/RLS: repository-owned migration and installed dependency bytes
are read only. No migration or journal file is edited or executed. No DB, schema,
policy, role, grant, ACL, owner or membership state is contacted. This gate makes
no database semantic or isolation claim.

Privacy/retention/events/audit: no PII, medical/legal narrative, member document,
durable row, cache, event, queue, log, metric, trace or audit record. Private SQL
exists only in process memory inside WeakMap-owned state. The module emits no logs.
A future caller may count stable error categories without attaching dynamic text.

Failure/abuse: forged capability, caller-controlled path/root/digest, dependency
substitution, symlink/replacement, reader shape abuse, getter/symbol abuse, mutable
provider arrays, count/order/hash/time/chunk drift, callback insertion mismatch,
diagnostic exfiltration and corpus change all fail before a capability exists.

Concurrency/races: calls have no cache or shared mutable plan. Source files and
corpus are checked before/after relevant work, but Node cannot atomically bind
verified disk bytes to module-loader bytes or atomically snapshot 97 files. A
privileged local writer remains a trust boundary. P0a1a1 must reread and compare
the exact pending callback immediately before any separately authorized execution.

Performance/cost: bounded local reads are three dependency sources (2 MiB each),
one generic reader pass over 93 SQL files, and one second P0a1a0a corpus scan.
Current plan has 227,222 item bytes and 246,041 serialized bytes; hard exact counts
and inherited 1 MiB SQL ceiling stop drift. No network/model/provider cost, DB
latency, background work or persistent cache.

Product KPI/human ops/support: no product-visible KPI or workflow changes. Success
is deterministic build-time/runtime-library evidence for the later migration
operator. Until P0a1a1 is separately promoted, there is no operator action, alert,
runbook, admin diagnostic, feature flag or degraded product mode.

Rollout: none. Merge would add an inert internal module with no caller or export.
Before a consumer, rollback reverts the six modules, five tests, no-growth boundary
change and conditional size metadata. After P0a1a1 exists, roll it back first, then
remove this producer; producer-first deletion is forbidden. There is no DB/provider
rollback because none is contacted.

Residual risk: source/module loading and multi-file reads are not atomic against a
privileged local writer. Source hashes deliberately pin complete Drizzle files, so
any upstream patch—even unrelated `PgDialect` code—requires a new reviewed gate.
The full 843-item digest proves only current all-pending callback semantics, not
live pending selection, transaction safety or successful execution. P0a1a1 still
owns schema/table/owner checks, live journal equality, suffix selection, exact
callback recapture, same-session transaction/lock semantics, execution, ambiguity,
retry and rollback.

Rejected alternatives:

- combine planning with live pg-proxy execution: previously NON_PASS and crosses DB;
- trust semver/lockfile only: does not bind the executed source bytes;
- bind reader but not pg-proxy/dialect: overclaims callback semantics;
- model 93 callbacks: false; pg-proxy emits one flat callback list;
- accept raw root/digest/reader output: forgeable caller authority;
- include four orphan SQL files: contradicts journal authority;
- serialize SQL-bearing capability: replayable data authority and leakage;
- use `src/migrate.ts`, CWD or environment root: prohibited and unstable;
- claim atomic filesystem/module loading: Node does not provide it.

## 10. Brain/reviewer/promotion disposition

Measured product-session start is blocked by advisory lifecycle debt:

    brain-product-session: active session already open:
    sess_2026-07-18T12-48-54-231Z_IDA-UI03a2-P0

The child did not close another task's session. Two authorized read-only
`brain-task --require-active-execution` passes ran. Authority pass run
`2026-07-20T05-15-47-830Z-IDA-DG19-A2a1a0b-AUTHORITY` missed both expected current
tracker files; exact-source pass run
`2026-07-20T05-16-01-726Z-IDA-DG19-A2a1a0b-SOURCE` missed both expected source/test
files. One narrow recovery search was used: `recoverySearchUsed=true`. Do not claim
product-session measurement, humanUseful, token/time saving or retrieval success.

Required same-hash exact-file reviews before acceptance:

- architecture: exact map/line feasibility, capability seams, dependency loading,
  pg-proxy/PgDialect fidelity, complete flat-plan semantics and P0a1a1 separation;
- contracts/security: input authority, source/corpus fail-closed checks, race claim,
  deep ownership, redaction, fake parity test, exclusions and abuse matrix.

Use bounded Sonnet 4.6 and Opus 4.8 where available; no-output/quota/access is
NON-PASS, not approval. Fable 5 is NON-PASS unless access is confirmed. Codex 5.6
Sol Ultra exact-file architecture and contracts/security are required fallbacks
when premium routes block.

Acceptance requires architecture PASS and contracts/security PASS on the identical
byte count/SHA, no unresolved blocker, clean ed514881 authority and explicit
orchestrator acceptance. Acceptance authorizes only a later docs-only canonical
promotion request. It does not authorize source, tests, runtime, DB, network,
provider, commit, push, PR, deployment or alias changes.
