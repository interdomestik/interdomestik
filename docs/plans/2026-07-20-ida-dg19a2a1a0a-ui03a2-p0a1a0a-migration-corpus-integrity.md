# IDA-DG19-A2a1a0a-R1 — Canonical Migration-Corpus Integrity Capability

Status: DRAFT_ACCEPTANCE_CANDIDATE — NOT PROMOTED
Slice: IDA-UI03a2-P0a1a0a
Human title: canonical migration-corpus integrity capability
Authority base: clean detached origin/main fccf91848898063bc434b97230808efa4d84f5b5
Classification: promotion/design-gate discovery; prospective implementation Tier 3
Runtime authorization: false

## 1. Outcome and stop rule

Build one pure filesystem integrity boundary that verifies the repository-owned
Drizzle migration corpus and returns only an authentic, redacted, opaque
capability. Its primary consumer is the later P0a1a0b plan builder. There is no
member-facing behavior.

Exact entry point:

    async function verifyCanonicalMigrationCorpus(): Promise<
      | Readonly<{ ok: true; capability: MigrationCorpusCapability }>
      | Readonly<{ ok: false; error: Readonly<{ code: MigrationCorpusErrorCode }> }>
    >

Success exit: a frozen success result holding one frozen MigrationCorpusCapability.
The capability serializes and inspects only as:

    {
      contract_version: "canonical_migration_corpus_v1",
      integrity_verified: true,
      journaled_migrations: 93,
      excluded_legacy_orphans: 4,
      sql_files: 97
    }

Failure exit: a frozen failure result containing only one stable code from section
7. No path, filename, tag, digest, SQL bytes, OS error, stack, errno, device,
inode, timing, environment value, or underlying exception is returned or logged.

Stop if the exact contracts below cannot be implemented within the exact file map,
strict less-than-150-line rule, and 3-engineering-day ceiling. Do not collapse the
map into a monolith, weaken no-follow behavior, or expand into P0a1a0b/P0a1a1.

## 2. Explicit scope

Included only:

- one root derived from the production module URL, never process.cwd(), an
  environment variable, a caller argument, or packages/database/src/migrate.ts;
- mandatory fail-closed platform support, realpath containment and no-follow
  reads for the root, meta directory, journal, and all 97 SQL files;
- exact journal byte digest, exact journal schema/order, exact 93 journaled plus
  four excluded-orphan SQL topology, 97 exact per-file byte hashes, and one
  domain-separated aggregate corpus digest;
- one WeakMap-backed capability whose public representation is the fixed summary
  above;
- deterministic, redacted failure codes and focused filesystem attack tests.

Explicitly excluded:

- Drizzle package resolution or source binding;
- generic Drizzle readMigrationFiles behavior, chunk parsing or derivation;
- pg-proxy, dialect, migrator, callback, flattened callback-plan, SQL scanner,
  pending-selection or equality logic;
- database clients, ReservedSql, SQL queries, journal-table state, bootstrap,
  transaction, locks, DDL/DML, migration execution or live database proof;
- packages/database/src/migrate.ts, package scripts, workflows, Docker/compose,
  migrations, meta journal/snapshots, roles, ACLs, memberships, seeds or fixtures
  involving a database;
- provider/network contact, remote readiness, deployment, aliases, UI, billing,
  proxy, routes, auth, session, OTP, tenancy or RLS architecture.

P0a1a0b may later accept this authentic capability and separately bind the generic
reader plus exact pg-proxy/dialect sources and a complete flattened callback-plan
digest. P0a1a1 remains the only live database-state and execution slice.

## 3. Exact file map and ceiling

Future implementation may touch only:

1. packages/database/src/migration-corpus-manifest.ts (maximum 125 lines)
   Static journal/corpus constants, four orphan names, and 97 SHA-256 values in
   journal order followed by the four listed orphans.
2. packages/database/src/migration-corpus-contracts.ts (maximum 125 lines)
   Result/error algebra, verified-state types, exact bigint stat snapshot,
   bounded directory/file adapter and deterministic stage-hook contracts.
3. packages/database/src/migration-corpus-root.ts (maximum 80 lines)
   Sole module-relative root ownership plus pure basename/child containment.
4. packages/database/src/migration-corpus-node-fs.ts (maximum 125 lines)
   Production node:fs adapter, mandatory flag guard, bounded streaming directory
   iterator, exact-size FileHandle reads and finally-close behavior.
5. packages/database/src/migration-corpus-directories.ts (maximum 145 lines)
   Root/meta no-follow descriptor lifecycle and bounded pre/post snapshots.
6. packages/database/src/migration-corpus-files.ts (maximum 149 lines)
   Journal/SQL lstat/open/read/postcheck lifecycle and hard-link rejection.
7. packages/database/src/migration-corpus-validator.ts (maximum 149 lines)
   Journal parser/shape validation, topology comparison, per-file and aggregate
   digest verification, and internal verified state.
8. packages/database/src/migration-corpus-capability.ts (maximum 125 lines)
   Public canonical entry point, WeakMap state, internal authenticated unwrap,
   stable result types, toJSON and inspect redaction.
9. packages/database/test/migration-corpus.test.ts (maximum 135 lines)
   Current-corpus, cwd-independence, exact manifest and opacity proof.
10. packages/database/test/migration-corpus-journal.test.ts (maximum 145 lines)
    Journal schema/order/digest and SQL/orphan/hash tamper matrix.
11. packages/database/test/migration-corpus-filesystem.test.ts (maximum 149 lines)
    Real root/meta/file symlink, hard-link, containment and topology proof.
12. packages/database/test/migration-corpus-faults.test.ts (maximum 149 lines)
    Deterministic adapter-stage growth, replacement, OS-error and close proof.
13. packages/database/test/migration-corpus-boundary.test.ts (maximum 130 lines)
    Capability forgery/prototype/redaction and exact import/dependency boundary.
14. packages/database/test/migration-corpus.support.ts (maximum 149 lines)
   No-DB temporary corpus copy/mutation helpers with deterministic cleanup.
15. scripts/repo-size-budget.json only if the unchanged deterministic generator
   requires the tracked-inventory update.

No index export and no change to packages/database/src/index.ts is allowed.
The entry point is an internal direct import for later separately authorized code.
The arbitrary-root verifier accepts an explicit root and CorpusFsOps only inside
the validator module, is never re-exported, never creates a capability, and may be
imported only by the capability module and the five exact test files. The production
capability passes only CANONICAL_ROOT from migration-corpus-root.ts and NODE_FS_OPS.
A source-boundary test must enforce those import and argument allowlists.

Every new production, test and support file must contain at most 149 physical
lines after formatting. The manifest's 97 hashes use one hash per line and derive
the 93 filenames from the already hash-bound journal. The maximum line allocations
above sum to 1,880 lines and deliberately leave separate reviewable budgets for
descriptor lifecycle, validation, capability and deterministic faults. Ceiling:
eight production files, six test/support files, one conditional deterministic
metadata file, one backend integrity outcome, 3 engineering days. Fewer files are
allowed only when every listed responsibility and test remains explicit and every
file remains below its stated per-file maximum; more files or a raised maximum stop.

## 4. Canonical root and mandatory filesystem algorithm

CANONICAL_ROOT_URL is new URL("../drizzle/", import.meta.url) and CANONICAL_ROOT
is its fileURLToPath/path.resolve value. Both are created and exported only by
migration-corpus-root.ts. They are the only root passed by
verifyCanonicalMigrationCorpus(). Production public API accepts no raw path, URL,
filesystem adapter or hook.

The internal asynchronous verifier has this exact testable shape:

    verifyMigrationCorpusRoot(
      root: string,
      ops: Readonly<CorpusFsOps>
    ): Promise<InternalVerificationResult>

CorpusFsOps contains only numeric noFollowFlag/directoryFlag, lstatBigint,
realpath, openFile, openDirectory and streamDirectory. File/directory handles
expose fstatBigint and close; file handles also expose read(target, offset,
length, position). All stat calls use bigint: true and compare dev, ino, nlink,
size, mtimeNs and ctimeNs. Test adapters may implement an optional
onStage(stage, relativeName) Promise hook. NODE_FS_OPS has no hook. Exact stages
are before_lstat, after_lstat, after_open, after_read, before_postcheck and
before_close. The hook is awaited only by the internal verifier and cannot alter
the canonical root or expected manifest.

The node adapter must fail closed before reading when node:fs constants
O_NOFOLLOW or O_DIRECTORY are absent, non-numeric, or zero. It uses numeric
O_RDONLY | O_NOFOLLOW for regular files and O_RDONLY | O_NOFOLLOW | O_DIRECTORY
for root/meta. There is no "when supported" branch and no flag-free fallback.

Directory enumeration uses the adapter's streaming async iterator, never
readdir/readdirSync or another full-array API. Root permits at most 98 entries,
meta at most 128 entries, each UTF-8 basename at most 255 bytes, and each snapshot
at most 32,768 aggregate UTF-8 name bytes. The iterator stops and closes as soon
as a bound is exceeded.

For root and meta, before enumeration and after all reads:

- bigint lstat reports a directory and not a symbolic link;
- realpath equals the normalized lexical path exactly;
- the opened no-follow descriptor fstats as the same directory device/inode;
- bigint post-read lstat/realpath/fstat and bounded entry snapshot equal pre-read.

The root snapshot contains exactly one real meta directory and the 97 expected
real regular SQL files. Meta may contain at most the bounded existing
non-executable regular snapshot files; symlinks and non-regular entries fail.
Meta itself and meta/_journal.json satisfy all containment/no-follow checks.
No snapshot is opened, read or hashed.

For journal and each SQL file:

- path.join receives only an exact manifest-derived basename after rejecting
  separators, dot segments, NUL, absolute paths and non-basename values;
- path.relative(realRoot, candidate) is non-empty, non-absolute and not ".."-led;
- bigint lstat reports a regular non-symlink file with nlink exactly 1;
- realpath equals the exact candidate inside realRoot;
- O_RDONLY | O_NOFOLLOW open and bigint fstat match lstat identity;
- journal/SQL prechecked size is at most 65,536 bytes and aggregate SQL sizes are
  at most 1,048,576 bytes before buffers are allocated;
- allocate exactly the safely converted prechecked size, perform bounded
  positional reads through FileHandle, reject short read, then perform one
  one-byte read at expected EOF and reject concurrent growth without allocating it;
- bigint post-fstat/lstat/realpath matches dev, ino, nlink, size, mtimeNs, ctimeNs
  and containment from the pre-read snapshot.

Any inconsistent observation, unsupported type, permission failure, disappearance,
replacement, short/long read, invalid UTF-8 journal or OS exception maps through
the total table in section 7. Handles and iterators close in finally.

This contract fails closed for stable symlinks, hard links and mutations crossing
one file's pre/open/read/post window. It does not claim an atomic 97-file snapshot:
an already verified file can change while later files are read or after return.
The capability proves only the bytes observed and hashed during its scan. P0a1a0b
must separately re-read through the authentic capability and equality-check its
complete derived plan; this receipt alone never authorizes execution. If atomic
multi-file immutability is required, this gate is NON_PASS because Node path APIs
cannot provide it. Repository/worktree write access remains a trust boundary.

## 5. Exact journal contract

Read packages/database/drizzle/meta/_journal.json as bytes. Required byte SHA-256:

    6bd8b96f439e4ac8a8e85be41c09659116637f5075710ea298369e4a0e1d0068

Decode with TextDecoder("utf-8", { fatal: true }), parse once, and require:

- exact top-level keys dialect, entries, version;
- version "7" and dialect "postgresql";
- exactly 93 entries;
- every entry has exactly breakpoints, idx, tag, version, when;
- idx equals its zero-based array position 0 through 92;
- version is "7", breakpoints is true, tag is a non-empty basename matching
  four decimal digits, underscore, one or more ASCII letters/digits/underscore/
  hyphen characters, with no .sql suffix;
- when is a positive safe integer and all 93 values and tags are unique;
- timestamps strictly increase except for the single digest-bound legacy
  inversion from idx 13 / 0013_add_agent_clients_unique / 1767890798000 to
  idx 14 / 0014_webhook_events_tenant_nullable / 1767469552201;
- idx 0 is 0000_watery_rawhide_kid / 1766044468466 and idx 92 is
  0092_ida_free_start_drafts / 1784332800000.

The exact raw journal hash is authoritative. Structural checks make rejection
diagnosable by stable category, not a license to accept a different journal with
the same shape.

## 6. Exact 93+4 topology, hashes and aggregate digest

Expected execution-topology names are the 93 journal tags with .sql appended, in
journal order. Expected excluded topology is exactly these four names, in this
order:

1. 0015_drop_tenant_defaults.sql
2. 0016_harden_better_auth.sql
3. 0017_performance_indexes.sql
4. 0018_add_commission_idempotency_index.sql

The four are integrity-checked but marked excluded_legacy_orphan in internal state.
This slice does not return their bytes and does not make any file executable.

The aggregate digest algorithm is exactly:

1. initialize SHA-256;
2. update UTF-8 bytes of interdomestik-migration-corpus-v1 followed by one NUL;
3. update the exact raw journal bytes;
4. for each of the 93 journal-order names then the four orphan-order names:
   update one NUL, UTF-8 filename, one NUL, then exact file bytes;
5. lowercase hexadecimal digest must equal:

    ced35bb36840043bd73799274cadcb6f28683d8864b0ec2bcbaa2abd2a83e111

Before aggregate success, each file byte SHA-256 must equal the indexed value in
Appendix A. A set equality check proves that root contains exactly these 97 SQL
files and no additional entry besides meta. Hashing is over raw bytes; no newline
or encoding normalization is allowed.

## 7. Opaque capability and redacted result contract

MigrationCorpusCapability has no public constructor. The capability module owns
one module-private WeakMap from frozen capability objects to frozen internal state.
Internal state contains only the verified real root, journal SHA-256, aggregate
SHA-256, the frozen 93 journal names, the frozen four excluded names and the
post-read root identity. It does not retain SQL or journal bytes.

The capability has no enumerable own properties. Object.getOwnPropertyNames,
Object.getOwnPropertySymbols, spread, structuredClone, JSON.stringify, String and
node:util.inspect must not reveal state. A structured clone is an unauthenticated
empty lookalike, not a capability. toJSON and inspect.custom return the exact
frozen summary in section 1. The class constructor, prototype, each instance,
summary and WeakMap state are frozen. A module-private constructor token and
WeakMap membership authenticate instances. Forged, copied, proxied, deserialized,
prototype-tampered or wrong-realm lookalikes fail internal unwrap.

The exact internal unwrap is:

    function readMigrationCorpusState(
      value: unknown
    ): Readonly<MigrationCorpusState> | null

It is exported only from migration-corpus-capability.ts by direct file import,
never from the package index. In this split only migration-corpus-boundary.test.ts
may import it. P0a1a0b may add exactly its plan module as a consumer only after
separate authority, must accept the capability object and fail on null, and may
not accept a raw folder, URL, digest, journal, name array or bytes.

Stable public failure codes:

- MIGRATION_CORPUS_PLATFORM_UNSUPPORTED
- MIGRATION_CORPUS_ROOT_REJECTED
- MIGRATION_CORPUS_JOURNAL_REJECTED
- MIGRATION_CORPUS_TOPOLOGY_REJECTED
- MIGRATION_CORPUS_FILE_REJECTED
- MIGRATION_CORPUS_CHANGED_DURING_READ
- MIGRATION_CORPUS_CLEANUP_FAILED

The total mapping and precedence are binding:

1. absent/zero no-follow or directory flag before I/O maps PLATFORM_UNSUPPORTED;
2. initial root/meta lstat, realpath, open, type, identity, streaming bounds or
   unexpected OS failure maps ROOT_REJECTED;
3. completed root snapshot name/type mismatch maps TOPOLOGY_REJECTED;
4. initial journal child validation, lstat/realpath/open/read/size/UTF-8/JSON/
   schema/hash failure maps JOURNAL_REJECTED;
5. initial SQL child validation, lstat/realpath/open/read/size/hash or aggregate
   size failure maps FILE_REJECTED;
6. after a successful initial observation, ENOENT/ELOOP/replacement, identity/
   metadata mismatch, short read or one-byte EOF growth maps
   CHANGED_DURING_READ regardless of journal/SQL phase;
7. iterator or descriptor close failure maps CLEANUP_FAILED and overrides any
   otherwise-returned success or failure;
8. CHANGED_DURING_READ overrides phase-specific rejection; other unexpected
   errors map to the current initial phase above.

Do not expose subcodes or dynamic fields. Every returned object and nested error
is frozen. The capability is created only after successful cleanup and every
other check. A failure creates zero capabilities.

## 8. Acceptance tests

C01 canonical current corpus succeeds with the exact frozen discriminated result
and summary.
C02 changing process.cwd() outside the repository does not change resolution.
C03 repeated verification returns distinct authentic capabilities with identical
public summaries and no retained raw bytes; later mutation is not claimed to
revoke the earlier observation.
C04 construction, reflection, serialization, inspection, spread, clone, proxy,
plain-object and prototype forgery reveal no state and fail authentication.
C05 the manifest contains exactly 97 lowercase 64-hex hashes; first 93 bind journal
order and last four bind the excluded names.
C06 journal keys/version/dialect/count/idx/tag/breakpoint, positive-safe-unique when
and the sole exact 0013-to-0014 inversion are enforced.
C07 journal byte change, invalid UTF-8, malformed JSON, static/during-read oversize
and missing journal map by the exact table.
C08 a positive clean temporary-corpus control succeeds through the arbitrary-root
verifier before negative mutation; missing/additional/renamed/directory/non-regular
root entries then fail exact topology.
C09 changing one journaled and one orphan SQL fails integrity; static/during-read
oversize, aggregate size, >98 root entries, >128 meta entries, overlong names and
snapshot-name budget fail boundedly.
C10 root symlink and lexical/realpath mismatch fail. Test support passes
fs.realpath(mkdtempResult), including macOS /private/var.
C11 meta, journal and SQL symlinks and journal/SQL hard links fail; missing
O_NOFOLLOW/O_DIRECTORY has no fallback.
C12 traversal, separator, absolute, dot-segment and NUL basenames fail the pure
child-name guard.
C13 deterministic onStage adapters replace, truncate and grow files after
open/read; each maps CHANGED_DURING_READ. No atomic-corpus claim is tested.
C14 injected EACCES, ENOENT, ELOOP and unexpected OS errors at every initial/post
stage map by the total table; sentinels never appear in output or console.
C15 adapter counters prove every opened handle/iterator closes on success/failure;
injected close failure maps CLEANUP_FAILED; temporary fixtures are removed.
C16 import scan proves the arbitrary-root seam is used only by capability and five
tests, unwrap only by the boundary test, and neither is package-index exported.
C17 import/AST scan, not raw substrings, proves no drizzle-orm, postgres, network,
database client, SQL executor, migrator, child-process, environment-root or
process.cwd dependency.
C18 no current migration, journal, snapshot, src/migrate.ts, package script,
workflow, Docker, database, provider, route/auth/tenant/RLS/UI/billing change.

Test support copies only meta/_journal.json and 97 SQL files into an fs.mkdtemp
directory, immediately resolves it with fs.realpath, and first proves an unmodified
positive control. It imports no application source except naming constants,
resolves no node_modules dependency, performs no DB/network action, and removes
the exact real temp directory in after/finally. Thus prior dependency-resolution
and macOS /var-to-/private/var defects are absent.

Focused implementation command:

    pnpm --filter @interdomestik/database exec tsx --test test/migration-corpus.test.ts test/migration-corpus-journal.test.ts test/migration-corpus-filesystem.test.ts test/migration-corpus-faults.test.ts test/migration-corpus-boundary.test.ts

Additional focused proof:

    pnpm --filter @interdomestik/database type-check
    pnpm check:modularity-guard
    pnpm check:db-access
    pnpm db:migrations:check-journal
    node scripts/repo-size-budget-sync.mjs --check
    pnpm repo:size:check
    git diff --check

Because future implementation is Tier 3, after focused proof and reviewer fixes it
must also satisfy pnpm pr:verify, pnpm security:guard and pnpm e2e:gate through the
AI OS heavy-job lease. The current pr:verify transitively runs the repo-mandated
existing live RLS integration lane; that inherited gate infrastructure is final
repository regression evidence, not slice-owned DB acceptance evidence or authority
to add/query/migrate a database. This slice adds no DB test and makes no DB-semantic
claim. Discovery/design runs no gate and contacts no database.

## 9. Security, operations and rollback

Data/tenant/authz/RLS: the slice reads repository migration assets only and handles
no tenant, identity, PII, claim, entitlement or database state. It grants no
permission and changes no schema/RLS/role/ACL behavior.

Abuse/failure cases: stable symlink at every read boundary, path traversal,
unexpected topology, content tamper, oversized input, special file, permission
denial, disappearance/replacement, unsupported no-follow flags and inspection
exfiltration all fail before a capability exists. Errors are local and redacted.

Concurrency: each call independently verifies the exact bytes it reads. There is
no cache, singleton or shared mutable state. Mutation crossing a file's observation
window is detected; mutation of an already-checked file may occur later and is the
explicit non-atomic residual. No partial capability is returned.

Performance/cost: hard read maximum is 97 SQL files, 1 MiB aggregate SQL plus
64 KiB journal. Directory iteration is bounded to 98 root and 128 meta entries,
255 UTF-8 bytes/name and 32 KiB names/snapshot. Exact-size buffers plus one-byte
EOF probes prevent concurrent growth allocation. There is no network/model/provider
cost. Expected main is 236,462 SQL bytes plus a 14,175-byte journal.

Observability: success/failure values are the observability boundary. This library
emits no logs, metrics, traces or audit rows because filenames, paths and hashes are
unnecessary diagnostics at this layer. A later caller may count the stable code
without attaching exception text.

Rollout/feature flag: none. This capability is unused until P0a1a0b is separately
accepted and implemented. Before P0a1a0b, rollback deletes the fourteen new files
and conditional size metadata. After any consumer exists, rollback must first
remove/revert every direct capability/unwrap consumer, then these files; deleting
the producer first is forbidden. Current migrations and runtime are unchanged.

Residual risk: Node path APIs do not provide openat2-style atomic RESOLVE_BENEATH
or a multi-file snapshot. Mandatory realpath/no-follow/nlink-one/bigint-stat/
bounded-handle-read/postcheck closes stable symlink, hard-link and within-file
detected-race attacks. It does not guarantee that 97 paths remain unchanged after
their individual checks. P0a1a0b must bind and equality-check its own complete
re-read before DB authority. Stronger atomicity requires a separate native
platform-specific design and is not implied here.

## 10. Reviewer and promotion gate

Required exact-file reviews before acceptance:

- architecture: modularity, root ownership, capability boundary, file map and
  future P0a1a0b seam;
- contracts/security: fail-closed no-follow/containment, TOCTOU claim, topology,
  hashes, redaction, test attack matrix and excluded surfaces.

Use bounded Sonnet 4.6 and Opus 4.8 where available; record no-output/quota/access
as NON-PASS, not approval. Fable 5 is NON-PASS unless access is confirmed. Gemini
may provide an independent signal. Codex 5.6 Sol Ultra exact-file architecture and
contracts/security are the required fallback when premium routes are blocked.

Acceptance requires both exact-file architecture and contracts/security PASS on
the same byte count and SHA-256, no unresolved blocker, clean fccf9184 authority,
and explicit orchestrator acceptance. Acceptance authorizes only a later docs-only
canonical promotion request. It does not authorize implementation, runtime, DB,
provider contact, commit, push, PR or deployment.

## Appendix A — exact per-file SHA-256 vector

Order 00–92 is journal order. Order 93–96 is the exact excluded-orphan order.

00 0000_watery_rawhide_kid.sql 5ddfd333f03255f388512f555becb7317852073a430ff621be9b00f63a428478
01 0001_long_shaman.sql 2e9731b24656ec8f5f5cb4844a6802eda50df5352c2d4effd7d6dee4fc76c936
02 0002_silky_sentry.sql 7345cea5023a1d1a12cf202488ac519cf53c3d889d624f2e43dc6704f7f1f905
03 0003_add_member_notes.sql 5db481db275e93ae972da295464fd8289d8c6b7e7fa70cf024763a952d967ab5
04 0004_add_agent_settings.sql 7805830dd9ac15eeb776a80034a63ff260357a72b3e22f6f476366bd55b91d5f
05 0005_add_policies.sql c25b2cc61ba1fa5137e316733cab9dc44d27166ea9e3a0471330e8521a97293e
06 0006_add_webhook_events.sql 40cffd5337f417c8c7186c574712bb06b295cf45a8c5061f025ed871192506c0
07 0007_add_notifications_and_automation.sql 72e76bda522e38d5ca1cd27c3aae5b730461682f3a96b4f5b9d504f5cd963ae1
08 0008_add_multitenant.sql 15e7391bdf8d738c5eb488e9d0cfcfaf65dddbc4542082ba9cd12a073f0986a9
09 0009_add_branches_rbac.sql 627681ed9bf2abb8a5cd5e1be0609619af08eebe5eec886542e94c95fe1531e7
10 0010_add_branch_scoping.sql 6670bc12d96bba8d45b4c2577b5bc0ad627ecef7d333eefba1a7afafb430f5b2
11 0011_refine_branch_schema.sql 569a3fcadfe42b81dbc7e5cc5b2f79a6392b3530994bb0a88f8388807412b843
12 0012_seed_default_branch_settings.sql 735de206cde5fc4c685eabe59f5d5bc76860b891f15381c45d1b466604cfe35c
13 0013_add_agent_clients_unique.sql e2cdcd474846c217655b502cfece193043d9bea5793c80c5247c7f802a941c1a
14 0014_webhook_events_tenant_nullable.sql febc143bdb2006054d1006be8e5d3c89cd738c2b57188077574a5ec101c909b5
15 0015_brown_the_call.sql 756fe2b0c04c34dbf0540481fac54b01c66181b76c0eb9e32fc0226415b257fe
16 0016_lean_lethal_legion.sql 2345bd368875d45ff7190ce58d1590a12d59eeaae5a0e5e30c7b096eaf73b159
17 0017_spicy_maginty.sql d8434352f5483f93a32e00240c1de2648c72ce7282cbb17e8aede37b2eab453f
18 0018_add-status-updated-at.sql 4951cdd0340574723231659f4a0cd737e836fb2abba084bc829f3626fb7b35a6
19 0019_calm_logan.sql 033157813504860f33e1dccf5cdcfb3ff0534fbc290e9e95f0a669bf3afefd19
20 0020_pink_cloak.sql 5c1ed0ca68f07993e803c471a291baa96a85332a3a007b80a77172c4b4e29058
21 0021_confused_hellion.sql 7b9316dd2aea441e1f45c175ca7b759caf24a7b5483722f02a18a704cc8b5e2e
22 0022_cloudy_weapon_omega.sql c518135821d2b8e581af77d68bee014d03b96a7a4839261ef04981654b043a60
23 0023_wise_sway.sql 8de0abf50de135b32b0ed0b2989825c8e6aeb715a5e8139850dd6f85698087ad
24 0024_complete_longshot.sql 24aa1333c1e6044ecb475d2f40e85544a122bdc4543e17fa6312cdfffe0e1de1
25 0025_swift_baron_strucker.sql 8e7d3cfda057cfb1bdf31623bd05616c1783a7ab4c1ff86db244f7c44a0bfb90
26 0026_panoramic_genesis.sql 9c3db2662d66eefe0f091b2fceac623e9a7d4f7ffcab376f9550ab3feec87dbc
27 0027_useful_shatterstar.sql fc8b7719c0880e40fe6fc3d657ff1fd6478825d5e89f17c439b0f799330fc032
28 0028_quick_roughhouse.sql 8937efe534d4ea6a21b6378aee51949c071392e2aa99d026e949b6bdb77cbf6e
29 0029_vengeful_skullbuster.sql 88d77f4cf03f98d23c2e6ea2822a46a504c23b9cc74ef822819ffd96a650cecd
30 0030_late_taskmaster.sql ad02a5d496d3e7868a76f1dccb634abc4cc5d1661cc72a86ea31caf19a772af6
31 0031_enable_claim_rls.sql cab9047ff3187f26cee8314a2bcd3f5fe365dbc5d22720a105793bc9ccd1efae
32 0032_member_activities_backfill.sql 66038f8044ce190f5302fa03a3b6f375508a3be08447dc2120fc683ee892d718
33 0033_webhook_scope_transaction_linkage.sql 94648636f2af46b3cd7a6fc65a8a7a067eb2253e7cb38cc6f1768f3466eea4cf
34 0034_invoice_append_only_ledger_invariants.sql 7246754eb1ef4572a96d8909668c8fb3da64ce18deff3b06df9296020cf77120
35 0035_enable_tenant_rls_coverage.sql 57b5585ca1269c1c79825f19dc95d74067daed9d5e69217cdfedd3c61471f43a
36 0036_supabase_advisor_security_hardening.sql 1b718ba0b91e1bdeda14872909c5d76bf052cd1742e81ed17e16e58d1ad88207
37 0037_add_ai_provenance.sql 57f6269cb1bb7ebc7a7ee1b7c03eff2967bdc1e8f48965b7265745005cc0f4aa
38 0038_add_policy_document_entity.sql 30682361bab18f6deee4475e0d33657eb9cddf7ebe4e1c8c8591a1fc6f7465d6
39 0039_add_legal_claim_document_category.sql 6345650d2b6c22946b84ffd66b24b8d2789d769be471662ec93d91ddc570c43b
40 0040_add_claim_escalation_agreements.sql c6f39850f5ce7ef39310d7ff4b87e66464f835bd63180df67ff8ad7d02febc4d
41 0041_add_success_fee_collection_fields.sql 6efbe4ce3923e11b53dc0c0aca1151e5e20b1f3d23bbe16f8a172561bebaabb1
42 0042_add_commercial_action_idempotency.sql b4a74107c0f4f3c6cc4f26a21298222f13593b527fee19424f89813b9ca962ee
43 0043_enable_commercial_action_idempotency_rls.sql 0c24c0d0eeb0e4140c959c2b07b905ba4ff0eb599f4cb1805545d0fefc7dcc35
44 0044_add_service_usage_recovery_guard.sql 7c03f1a38c98b7e4b3c26bbc02ec2812544831dd3172f9146a64dc3114d949fb
45 0045_pale_blur.sql 4517e572ae349f682318b5261d95c0b6a5dc19e35d2658ff0982001d49a1bd52
46 0046_s08_case_acceptance_gate.sql ab1feabf104831be99cb7a18423b9b0149496bbdee935791d5034aa0fd488f05
47 0047_member_referral_rewards.sql 9ae11202d20067de3f6450975420ddae13ff7ee7d92b1f9cabfdde0aeb78b23a
48 0048_enable_member_referral_rls.sql 4d96c6d0979513eaf388dd3b3af0ff17b040af6c0c6e994ca6e9522a46548fc9
49 0049_amusing_manta.sql 9f715a9f97a24cb5c3f15780c93c0d97dc5ec7a006940ccf8a813e86addae6e4
50 0050_reconcile_push_subscriptions.sql 7328fd2b8df21c08cd4926a24b32725914b291b5ae33481768f1727a050ea2c4
51 0051_enable_push_subscriptions_rls.sql efc25b033f3856aed51a36963bb3c5b8a355f404316daefe198d705dfa98a032
52 0052_cheerful_rhino.sql 1e5947d0c6de48e780357dd4b37e0899dd5e8ce6c66f6bb11ec2cf1842fe6869
53 0053_backfill_canonical_membership_plan_state.sql 0ccd640ecedb02c1052793fbd287bcbb21c6e7d948af4e8a7fbaa4a5697e9449
54 0054_support_handoffs.sql 8fbc7a9a5b5bf9bbcf7cd14be1fa597845f22dcaacd852d5ae70f1249223afe7
55 0055_brown_deathstrike.sql e2f08d36c6d5b7c99d12edb30e1855a6f7c075df5b30fdfdb707587fda6a4feb
56 0056_support_handoff_public_response_acknowledgement.sql 06a39e20c7cda89eaab848f9bd7f5b705cc21aed55d54683e45b1fafb7ac26bb
57 0057_pale_peter_quill.sql 88b4391babfa7d76e4942faebea6ccf5e0ced720632edbedaa2c4df3d5e0451f
58 0058_redundant_tinkerer.sql 770e30bad8e81e580a2380ebc2292a093bc92ec0863a872bf0ab32fa736f8a3b
59 0059_wide_terrax.sql 71e62ef77304b9f3b1e60c0f7370e03d93f6cc2a33e876782660dc417dac7e90
60 0060_crm_lead_ownership_history.sql 254fab6d889f99af8c0d7bdc714690c04672d617888ce1f3e4583472e520cfae
61 0061_crm_activity_discipline.sql 6bdb4530bd87891fc04e27ca5927c98ac1db183df3087458974d4d0353cd45c5
62 0062_careful_gideon.sql 68916584b45772997ed86f46f8e441b0c770f8c1912e409c21ccbaf0f48a532e
63 0063_clean_serpent_society.sql d4a4a221775d937e701007b63844a67e594153ba9718f9f188f65da9e2cd6d82
64 0064_crm_routing_persistence.sql d93adfd858187ab64f4658b6b834f8f18bc39b6abcf82d6391fb8b6e5f42b273
65 0065_crm_task_persistence.sql f2a6637381b56153227f9b8d3a0e191e4e564cb44d51e00669fe586411f2fadf
66 0066_crm_task_priority_history_constraints.sql 7be7350e44032a3df729f400f5f1d912a0e5a325d2462372d4917e00aeae36c7
67 0067_motionless_chamber.sql 2305c55444a198cd5aeb26fd6d95ccd1ede99b96d745091ddeca6d57bd95bf4a
68 0068_add_domain_events_outbox.sql 2279afa4d53b7f4953cd8e78a9004d52a5934874dcac35093f675ab56218166a
69 0069_enable_domain_events_rls.sql 93bf97125d0b86090fde37c6d1114ec513268497a47ae6bb31847faebaacbf04
70 0070_domain_event_deliveries.sql c86240643207f602192c98332dc1d415fbada664aaa69fd40972633b27521881
71 0071_claim_lifecycle_states.sql 6bc3ed4d7c6d1c548e5593bee5a70cd2080f5c2e3682f77d65c0d9aa0eeb8146
72 0072_claim_incident_country.sql 8f86c07e3c0463f4292a9a77542f4c8eeeb87053b1c716aed4701e8f8634bf99
73 0073_harden_member_referral_reward_type_functions.sql e524410eafa2f75a2cced570287d4a33e59be401292ba61eebf446bb15b0e558
74 0074_drop_duplicate_legacy_indexes.sql 1ba5d7fe04e1ede40d1927de0246ce79a1e569c0263377392f8627c44a65049c
75 0075_optimize_tenant_rls_initplan.sql d018234e605b36fba430cd3e35909d9a9edd73aa863772908f12deecddf8e1eb
76 0076_tenant_governing_law_terms_version.sql 5c82e30a2817e2ef6e049b181a8c4bc05c983c1c80b1fa6dea840779f5c05097
77 0077_subscriptions_entity_of_record.sql 2523f0b6aa5bd4adf381d5e17aacb321eb48494c49c5cdbbd52a8e8affb956b1
78 0078_backfill_tenant_codes.sql 0b614107f97f7d7a8eb296e370514761e7e4b32e59f5a3ccef65f335ff57c42c
79 0079_domain_event_keys.sql 6b405052eac8fdc9467ce7e5888f53c6c58a07f00ffdbdcb42260edc8a731589
80 0080_event_pii_references.sql 0e8bb7b76e15163c3bd80b07438fbf36a68e18d97faf13acee61549ae32196d5
81 0081_user_residence_country.sql f0bacba890e2b47e679b74815050a27cb004880efcfbe4494c144b8bfe36a166
82 0082_claim_recovery_law.sql 8c9ced6f30718cfa565f9aabb32087ea5bb3548030ac83a1b4bb562da67fe73b
83 0083_access_tenant_rls_policies.sql 1118558496801b278c34390d8fd1930c3227521c4e856e0311376ff085cde783
84 0084_claim_recovery_no_fee_evidence.sql 1725166411856d428d080f5442639af817131205a7dc62f7fd3710e267d723cb
85 0085_case_scoped_access_grants.sql d96464f351af452df1a2d60609fb3555505ee12f01d665583cb01c41d97a998c
86 0086_access_tenant_divergent_tables.sql 7baf6c6a2fb99baeeac2754285bc2084746d9c4ac8602617b751e674b696767f
87 0087_claim_document_ai_extraction_consents.sql b239e6265ee860a092a1ddbb93f8bf873ace5bf3857bdd1613bb487ad302d8a7
88 0088_tenant_entity_decomposition.sql 9a6ebf29942f84da7d6dab8c72111994ad470e360807c529d04f9e0a25f7f541
89 0089_domain_events_host_id.sql 53f426958193485ccbfa279d45c0806717b7373f7bbc71dd015207991be3d8c5
90 0090_t002b_claim_transition_evidence.sql a091481c6f726575c7b5f47d635d4601616a62a71389998d15134a2f948587ea
91 0091_t503_drop_claim_status.sql fa1bf64dad668984da2137de55aaaf06e56415d10e0a16bb1bbe90236e6ac3fa
92 0092_ida_free_start_drafts.sql 24f20b060266d63ff470dd1bd93b65bd8cb0b8998b2b5c16cac9e1e5d4d553ce
93 0015_drop_tenant_defaults.sql 6a09bd57cfd9de9e5faef4ce222c48bcea0f24c203d83e8a7233791dd2ea281f
94 0016_harden_better_auth.sql f4e6464b7d4f8375541d26d82101ef9451f220d4b94c857187577fbf32bbf6cc
95 0017_performance_indexes.sql c3b4597a85a2a9a0690eaacd54228a6af26790221fd6415484f85838806f2751
96 0018_add_commission_idempotency_index.sql 66a444337240459cb5df5d70acbee12e3bb9c62228386a9a77f1b8b0e3d63dd1
