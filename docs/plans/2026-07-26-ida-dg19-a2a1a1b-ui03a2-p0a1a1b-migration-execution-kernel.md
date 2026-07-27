---
plan_role: input
status: draft
source_of_truth: false
slice: IDA-DG19-A2a1a1b
proposed_implementation_slice: IDA-UI03a2-P0a1a1b
owner: platform + security + database + qa
date: 2026-07-26
last_reviewed: 2026-07-27
---

# IDA-DG19-A2a1a1b — Same-Session Migration Execution Kernel Gate

> Status: final consolidated closure authority is in preparation and supersedes
> R2 through R5 for every future resume decision. R5 merged through docs-only PR
> `#1456` at main `3bc8b0da…`; the preserved implementation is clean at
> `cc3231a9…` in the same worktree, branch and unmerged PR `#1455`. A complete
> advisory-key audit and PostgreSQL 15/16 interleaving matrix proved the reader
> snapshot-order defect and the bounded shared-session-lock repair before this
> authority change. Runtime remains frozen until this final authority merges and
> a new exact receipt is accepted. Implementation merge remains separately
> human-gated.

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
- Current implementation authority: paused; every R2-R5 runtime receipt is
  superseded for resume purposes by the complete lock-closure findings recorded
  in the final consolidated amendment below.
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

### R3 revalidation evidence

- R2 merged through docs-only PR `#1452`; canonical main and `origin/main` are
  exact at `7fabf26ede0420456857883860404834848dc279`.
- Fresh repo resolution is `ready` with exactly one active implementation slice,
  `IDA-UI03a2-P0a1a1b`. The resolver's heuristic tier is non-authoritative; the
  accepted gate's Tier 3 classification remains binding.
- AI OS observation
  `984a9fdd7c3d41b06d2dd5d3fcf7237775004499864989ea92e73ace3bc32ede`
  passes its current-state check with repo authority current. Its
  `activeSlice=none`, `runtime=not_authorized` result is advisory adapter drift
  against canonical repo authority and correctly grants no runtime permission.
- The sole implementation candidate is retained locally and clean at
  `9b6e274b6b5bffa08ff6ef6296369a20b9da4457`, with no remote branch and no PR.
  Its exact nine-path patch remains evidence only while this amendment is open.
- Focused Z620 PostgreSQL 16 proof showed that callback items `0` and `1`, the
  fully qualified `CREATE TYPE "public"...` statements from migration `0000`,
  succeed. Callback item `2`, the first unqualified
  `CREATE TABLE "account"...`, then fails under the R2 callback path
  `pg_catalog, public, pg_temp`. The kernel returns only the redacted
  `MIGRATION_EXECUTION_CALLBACK_FAILED` code and the transaction rolls back.
- The focused rerun recorded two passing and two failing assertions, identified
  callback index `2`, and left no task container. Z620 remains supporting
  pre-push evidence, not merge authority; P8 infrastructure certification is not
  repeated.

This is a contract defect in R2, not permission to rewrite the authenticated
migration corpus or journal. The canonical 93-migration corpus contains
unqualified DDL and is already content-hash bound. Qualifying or regenerating it
would cross the explicit migration/journal forbidden surface and requires a
different authority decision.

### R4 stop evidence

- R3 merged through docs-only PR `#1453`; canonical `main` and `origin/main`
  are exact at `19ae941a49eb933ce2c82d8261ab9d5b9892330e`.
- Arben accepted the exact R3 runtime receipt at 13,183 bytes / SHA-256
  `e310fce880caae71b55f8057c77b5efa5aa39e3534d38242ed983c6c8d4185ec`.
  That receipt authorized only the existing implementation branch and
  worktree, disposable PostgreSQL 16 proof and canonical Z620 pre-push.
- The candidate was rebased directly onto accepted main as local head
  `2056c9642e8234bfd8f0ce4746fc72823feb0dc1`, tree
  `cb211e5312d4df1357b66debf52770de5afa653e`. Its full current patch is
  38,622 bytes / SHA-256
  `ab1d9d319b6333072593519df58aebac291a91fa1c7488babaf4570f7be57c05`.
  The 11,975-byte staged R3 delta is SHA-256
  `e6462900085f0e533569978df447422524b5623dcda6222d121ff7421262118e`.
- The sole worktree remains
  `/Users/arbenlila/development/interdomestik-ida-ui03a2-p0a1a1b-migration-execution-kernel`
  on `codex/ida-ui03a2-p0a1a1b-migration-execution-kernel`. Five approved
  paths are staged; there is no unstaged product edit, remote implementation
  branch or PR. No database, migration or security-scan process remains active.
- The archived execution task is
  `019fa030-700c-7803-9b02-cc64faa3c7e8`. Its app-server transport failed with
  `EPIPE`; the restart could not recover the conversation state. The durable
  worktree, not the broken task, is the implementation evidence.
- `validatePublicSchema()` currently proves only schema owner and current
  `CREATE` ACL posture. The test fixture drops and recreates `public`, so it
  cannot detect an object created while a non-owner held `CREATE` and retained
  after that privilege was revoked.
- Exact-current GPT-5.6 Sol Ultra read-only adjudication confirmed a component
  blocker: a stale `public.now()` can survive `REVOKE CREATE`, resolve before
  `pg_catalog.now()` under R3's explicit public-first path, and execute with the
  privileged migration caller's rights. Current deployed exposure is not
  established because the kernel has no non-test caller and remains inert.
- PostgreSQL 16 documents that `pg_catalog` is searched implicitly before named
  path entries when it is omitted, that explicitly naming it changes its search
  position, that the first named valid schema remains the creation target, and
  that revoking schema `CREATE` does not remove existing objects. R4 therefore
  corrects name resolution and adds a fail-closed stale-object inventory instead
  of treating current ACL state as historical proof. Primary specification
  anchors:
  [search_path](https://www.postgresql.org/docs/16/runtime-config-client.html),
  [schemas and secure usage](https://www.postgresql.org/docs/16/ddl-schemas.html),
  and
  [function resolution](https://www.postgresql.org/docs/16/typeconv-func.html).
- AI OS observation
  `74c32274f209474e6b05424463498a8c45c69627888d63125fee3354c97785cc`
  passes its current-state check with repository authority current,
  `activeSlice=none` and runtime not authorized. Brain freshness and session
  integrity drift remain advisory and grant no runtime authority.

This is a contract defect in R3, not permission to expand the writer map or
rewrite the authenticated migration corpus. The correction must stay inside the
same four production files, four test/support files and optional deterministic
size metadata. If a complete stale-object invariant cannot fit that boundary,
R4 stops for a different authority decision.

### R4 reviewer disposition

- Priority Opus 4.8 was attempted through the bounded no-tools route and blocked
  with `reviewer_no_output_timeout` after 300,643 ms. It is NON-PASS and is not
  counted as approval.
- Approved Sonnet 4.6 fallback completed in 244,011 ms with PASS/no blockers,
  one medium completeness finding and two low clarifications. R4 expanded
  collision coverage to every inventoried catalog family, documented the
  concurrency/trust boundary and defined the marker side effect.
- Post-remediation Sonnet 4.6 completed in 208,734 ms with PASS. It confirmed
  all three findings resolved, the corrected PostgreSQL 16 path semantics,
  fail-closed inventory, test-first RED, writer-map/line-ceiling stop and
  authority continuity, with no new blocker, high or medium finding.
- Fable 5 is skipped because access is suspended/unverified. No second-signal
  model is required while the bounded fallback disposition is clean.

### R5 compatibility and test-boundary amendment

- R4 merged through docs-only PR `#1454` at canonical main
  `852946f5263abd0eed2b90e5b3a6f960c518e0e6`. Arben accepted its exact
  32,532-byte gate at SHA-256
  `53d0e07d5570423e8d9c97e075f34d434ab9eea58568a9851f3ee0a550f19073`
  and the 14,201-byte runtime receipt at SHA-256
  `af91848ff14ecf08b8587d4cd38d814e886b5ef35307f666518406faa1dc64b8`.
- The preserved implementation is clean at
  `/Users/arbenlila/development/interdomestik-ida-ui03a2-p0a1a1b-migration-execution-kernel`,
  branch `codex/ida-ui03a2-p0a1a1b-migration-execution-kernel`, head
  `5f581610c2b7a5ea7661e1ed7c106a7c4c4bb39c`, tree
  `3f456230680786d2579da1bf843104512fb12814`, and open PR `#1455`. Its
  nine-path patch against R4 main is 52,877 bytes at SHA-256
  `5c6dd1b483b097aee83c50895616f1bc22fd1dafea8d82115f66a38105e11026`.
  Preserved stash object
  `9fe4703b7bc36f70f279cc414c65878a4c7c209a` remains recovery evidence and
  must not be dropped before terminal implementation merge or closeout.
- Current-head Codex review thread `discussion_r3656804940` is binding P1 stop
  evidence. PostgreSQL 15 accepts only `MEMBER` and `USAGE` for
  `pg_catalog.pg_has_role`, while PostgreSQL 16 adds `SET`. The current fixed
  `'SET'` probe therefore rejects every PostgreSQL-15 execution before the
  callback transition even though the accepted preflight supports majors 15
  and 16.
- R5 requires one fixed version-aware expression inside the existing qualified
  stale-object/role probe:

  ```sql
  CASE
    WHEN pg_catalog.current_setting('server_version_num')::integer >= 160000
      THEN pg_catalog.pg_has_role(role_oid, owner_oid, 'SET')
    ELSE pg_catalog.pg_has_role(role_oid, owner_oid, 'MEMBER')
  END
  ```

  On PostgreSQL 15, `MEMBER` means the right to perform `SET ROLE`; on
  PostgreSQL 16 and later, `SET` is the exact separated option. The result is
  used only as a fail-closed rejection predicate. Version lookup, cast, query or
  result-shape failure rejects before callbacks. No version text is parsed, no
  dynamic SQL or identifier is introduced, and no caller may provide a
  version, role or privilege keyword.

- Primary specification anchors are the PostgreSQL
  [15 access-privilege inquiry functions](https://www.postgresql.org/docs/15/functions-info.html)
  and
  [16 access-privilege inquiry functions](https://www.postgresql.org/docs/16/functions-info.html).
  PostgreSQL 15 defines `MEMBER` as direct or indirect membership carrying the
  right to `SET ROLE`; PostgreSQL 16 distinguishes `MEMBER`, `USAGE` and
  `SET`.
- On PostgreSQL 16+, an inherit-only membership without the `SET` option is
  intentionally excluded by this specific “can assume owner” probe. Its
  effective schema privilege is still rejected by the separate non-owner
  `CREATE` check, and any object it creates remains non-owner-owned and is
  rejected by the stale-object inventory.
- Current-head Codex review thread `discussion_r3656804943` is binding P2 stop
  evidence. The candidate replaced
  `packages/database/test/migration-callback-boundary.test.ts` with integration
  cases, removing the accepted structural proof for exact private
  readers/issuers and consumers, absent package/runtime exports, the sole
  `.unsafe` sink and per-file ceilings.
- R5 restores `migration-callback-boundary.test.ts` to that structural role,
  updated for the four execution modules and the new integration-test path.
  Existing PostgreSQL execution/collision cases move without semantic loss to
  one new
  `packages/database/test/migration-execution-boundary.test.ts`. This is a
  test-allocation correction, not a production or outcome expansion.
- Arben's 2026-07-27 instruction explicitly authorizes preparation and
  canonical merge of docs-only R5, a replacement receipt bound to the preserved
  identity, mandatory test-only RED, the compatibility fix, test split,
  PostgreSQL 15/16 focused evidence, Z620 gates and current-head review. It
  explicitly withholds implementation merge authority: final merge requires a
  new human approval after all exact-head evidence is green.
- That forward instruction authorizes the final reviewed R5 bytes and SHA-256
  when, and only when, they preserve this exact scope. The docs PR records the
  final bytes/hash before merge, and the replacement receipt rebinds them after
  merge. Any substantive contract, writer-map, ceiling or authority change
  invalidates the forward authorization and requires a new user decision.

R5 supersedes only R4's version-difference stop and four-test/nine-path
allocation. The corrected search-path contract, stale-object collision
invariant, four production writers, 1,150 changed-line ceiling, 2.5-day ceiling,
one outcome and every protected exclusion remain unchanged.

### Final consolidated lock-closure amendment — supersedes R2 through R5

This section is the sole prospective authority for completing
`IDA-UI03a2-P0a1a1b`. Earlier R2-R5 hashes and receipts remain historical
evidence only and cannot authorize another implementation action.

The final closure is bound to clean canonical main
`3bc8b0da35bc309f89b5fd3ac67e3ce52dcb0f75`, tree
`64efb336ac9dfbfbca7cdffefe4c78b4d3b54ff5`, and the preserved sole
implementation worktree
`/Users/arbenlila/development/interdomestik-ida-ui03a2-p0a1a1b-migration-execution-kernel`.
That worktree is clean on branch
`codex/ida-ui03a2-p0a1a1b-migration-execution-kernel`, head
`cc3231a97e64c2683403ba67ff39062f08d316b0`, tree
`96c6b372faa0739c521e077821462779465edf06`, and unmerged PR `#1455`.
Its ten-path patch against the bound main is 55,417 bytes at SHA-256
`b52c1e62bf817c8a6723a844673e77e4a2fb9ae98887e4b5d798b29c0cd7b612`:
1,055 insertions and 59 deletions. Recovery stash
`9fe4703b7bc36f70f279cc414c65878a4c7c209a` remains preserved.

The complete executable fixed-key graph has exactly two production consumers:

1. the candidate kernel takes the exclusive session-level
   `pg_try_advisory_lock(673167055, -773281837)` before its repeatable-read
   write transaction, commits or rolls back, then explicitly unlocks;
2. the merged ledger inspector currently begins repeatable read first and then
   waits on `pg_advisory_xact_lock(673167055, -773281837)`.

No app, package export, workflow or command imports either consumer; both remain
inert. The legacy `src/migrate.ts` Drizzle command and `apply-migration.ts` SQL
directory runner do not consume this key and remain explicit non-cooperating
writers outside this slice. This amendment neither coordinates nor modifies
them. P0a2 continues to own later caller, command, runtime-role and permanent
matrix integration. Free-start-draft advisory locks use a different hashed
owner keyspace and are not part of this graph.

The current reader order is defective. PostgreSQL repeatable read freezes its
snapshot at the first query/data-modification statement; the advisory-lock
`SELECT` freezes that snapshot before it waits. Task-owned no-volume evidence on
both PostgreSQL 15 and 16 observed a waiting reader return value `0` after its
exclusive writer committed value `1`. The corrected order on both majors used a
shared session-level reader lock before repeatable read and observed the
writer's committed value `2`. Both majors additionally proved two shared
readers coexist, the exclusive writer is excluded, every shared unlock succeeds,
lock timeout is SQLSTATE `55P03` with zero retained reader lock, and closing a
waiting session rejects the request and removes the session. Both task
containers were removed.

The 8,320-byte proof harness is SHA-256
`334955362665a118d372b0ce185047de1d89ad719d5209bd6d6b07b2bef964e1`.
The final 10,519-byte audit/review packet is SHA-256
`f9ecf14d353e3544a91b9281ad2f35154583e353f1d0062593d6c80109dfe39b`.
Priority Opus 4.8 found the concurrency design sound, required one internal
reader-lock helper contingency to prevent another amendment at the physical-file
ceiling, and then passed the remediated exact packet with no blocker.

The corrected reader contract is:

1. authenticate capability and empty-prefix shape before SQL;
2. begin one short read-only acquisition transaction on the reserved session;
3. apply fixed local `pg_catalog, pg_temp`, 2-second lock, 5-second statement and
   5-second idle-in-transaction guards;
4. execute fixed qualified blocking
   `pg_catalog.pg_advisory_lock_shared(673167055, -773281837)` together with
   `pg_catalog.pg_backend_pid()`;
5. mark the shared session lock acquired immediately after the query resolves,
   before post-await abort or result-shape validation, require one integer PID,
   and commit the acquisition transaction;
6. while that session lock remains held, begin the existing repeatable-read
   read-only inspection transaction, reapply fixed local guards, and make the
   qualified same-PID check its first snapshot-taking statement;
7. perform the existing catalog/prefix inspection, final same-PID check and
   commit;
8. attempt exactly one fixed qualified
   `pg_catalog.pg_advisory_unlock_shared(...)`, require one true result and the
   same PID, then perform the final abort check before success.

On failure, roll back any open transaction before the one allowed shared-unlock
attempt. Rollback or unlock failure dominates as
`MIGRATION_LEDGER_CLEANUP_FAILED`; `55P03` while waiting remains
`MIGRATION_LEDGER_LOCK_TIMEOUT`; reserved-session close is the final release
backstop. If the response itself reports successful acquisition but malformed
PID/row shape, cleanup still attempts the fixed unlock. If transport corruption
makes acquisition unknowable, fail closed and rely on mandatory session close.

The integrated writer cleanup repair is also required: when the exclusive lock
response reports exact `locked:true`, record acquisition before validating PID
and row count. A malformed success response must make one fixed unlock attempt;
normal `locked:false` contention still makes none. This is inside the declared
kernel cleanup boundary and adds no caller or behavior outcome.

The existing version-aware PostgreSQL 15 `MEMBER` / PostgreSQL 16+ `SET`
contract, corrected
`pg_catalog, pg_temp → public, pg_temp → pg_catalog, pg_temp` search paths,
stale-object/collision inventory, callback-plan equality, ledger-prefix proof,
redaction, rollback and postcheck contracts remain binding without
reinterpretation.

Findings and fixes inside the exact lock/inspection boundary, named writer map
and ceilings below do not require another authority amendment. A fresh amendment
is required only if closure exposes a fundamentally different architecture
problem: a new caller/outcome, a non-cooperating writer that must be changed,
another keyspace, public API/workflow integration, or a protected surface outside
the declared map.

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
2. on the reserved session, call fixed, qualified
   `pg_catalog.pg_try_advisory_lock(673167055, -773281837)` and record
   `pg_catalog.pg_backend_pid()` in the same statement; contention fails
   immediately before `BEGIN`;
3. while that session lock is held, begin one `REPEATABLE READ` read-write
   transaction, so its first MVCC snapshot cannot predate lock acquisition;
4. set `search_path = pg_catalog, pg_temp`, `lock_timeout = '10s'`,
   `statement_timeout = '60s'`, and
   `idle_in_transaction_session_timeout = '30s'` with fixed `SET LOCAL`
   statements;
5. recheck the backend PID and validate through qualified `pg_catalog` reads
   that `public` is the single ordinary schema, is owned by `current_user`, and
   grants no `CREATE` to any non-owner; also fail closed unless the catalog
   inventory proves both zero non-`current_user`-owned resolution-visible
   objects in `public` and zero `public` relation, type, routine, operator,
   collation, conversion, operator-class/family or text-search-object identities
   that collide with `pg_catalog`; the ownership inventory must cover the
   owner-bearing relation, type, routine, operator, collation, conversion,
   operator-class/family and text-search configuration/dictionary catalogs
   available on PostgreSQL 16, while the collision inventory must also reject
   namespace-only text-search parser/template collisions regardless of owner;
   use only fixed qualified catalog reads, and return counts/booleans rather
   than names; retain
   `search_path = pg_catalog, pg_temp` throughout validation, plan rebuild,
   ledger inspection and bootstrap; every kernel-owned statement in this phase
   uses fixed `pg_catalog` or `drizzle` qualification, except the fixed
   `CREATE SCHEMA drizzle` target, creates no `public` object and accepts no
   dynamic identifier;
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
10. when the pending suffix is nonempty, re-run the complete public-schema ACL,
    owner, stale-object and collision probe immediately before its first
    callback; only after every capability, plan, public-schema and ledger-prefix
    check has passed, transition from the catalog-only validation path to the
    callback-only path with fixed
    `SET LOCAL search_path = public, pg_temp`; omitting `pg_catalog` makes
    PostgreSQL search it implicitly before `public`, while the first named valid
    schema remains `public` for unqualified object creation and explicitly named
    `pg_temp` remains last; an empty suffix never enters the callback-only path;
11. execute each bounded authenticated callback item sequentially through the
    reserved session, checking the in-process `AbortSignal` before and after
    every item without issuing abort-check SQL, then immediately transition with
    fixed `SET LOCAL search_path = pg_catalog, pg_temp` to the
    post-execution validation path before any post-execution catalog, ledger,
    plan or PID validation; when the pending suffix is empty, perform that same
    fixed transition directly from the catalog-only validation path before
    step 12;
12. under the post-execution validation path, re-read the ledger and require
    `all_applied` with all 93 exact ordered hash/timestamp pairs;
13. rebuild and compare the corpus/callback plan again after execution and
    before commit, so source or corpus drift rolls back the transaction;
14. recheck backend PID through qualified `pg_catalog.pg_backend_pid()`, recheck
    abort state, commit once, call fixed qualified
    `pg_catalog.pg_advisory_unlock(673167055, -773281837)` on that same PID, and
    require exactly one successful unlock before returning a frozen redacted
    summary.

Any failure after `BEGIN` rolls back. Every path after successful lock
acquisition attempts exactly one fixed unlock, including `BEGIN`, rollback and
commit failures. Rollback or unlock failure dominates the original error as
`MIGRATION_EXECUTION_CLEANUP_FAILED`; the P0a0b wrapper then closes the reserved
client, which releases any surviving session lock. No partial success or pending
suffix is returned.

If a callback or its post-item abort check fails before the success transition,
the callback-only path remains local to the doomed transaction. The failure
branch issues `ROLLBACK` before unlock; rollback and commit resolve no schema
object, all PID/lock/unlock calls are explicitly `pg_catalog`-qualified, and
the redacted in-process result builder issues no SQL. Cleanup therefore cannot
resolve a caller-controlled or `public`-shadowed kernel object.

The callback-only path is creation-target-first but resolution-safe only because
all of the following are simultaneously true: PostgreSQL implicitly resolves
`pg_catalog` before the named `public, pg_temp` entries; `pg_temp` is explicitly
last; the callback list comes from the genuine prototype-plus-`WeakMap`
capability; the corpus, offsets, callback items and dependency sources are
hash-bound and freshly revalidated; no caller input, dynamic identifier or
arbitrary SQL is accepted; `public` is owned by `current_user`; no non-owner has
`CREATE` on `public`; and the stale-object/collision inventory passes
immediately before callback execution. The path begins only after those checks
and ends immediately after the final callback. All kernel-owned catalog and
post-execution reads remain qualified and execute under
`pg_catalog, pg_temp`.

The repeated probe is not a claim that the advisory lock blocks arbitrary
schema DDL. After the probe, current ACL posture leaves no non-owner able to
create in `public`; an external connection that can still create must be the
trusted `current_user`, a superuser or a role able to assume that owner. Those
administrative identities are outside the non-owner threat boundary and their
compromise cannot be repaired by search-path ordering. The advisory lock
coordinates cooperating migration workers only. Any ambiguous role membership,
effective non-owner `CREATE` capability or catalog result fails closed before
the callback transition. “Able to assume” is evaluated by the fixed R5
version-aware contract: PostgreSQL 15 uses `pg_has_role(..., 'MEMBER')`, while
PostgreSQL 16 and later use `pg_has_role(..., 'SET')`, selected only from
qualified numeric `server_version_num`.

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
- unsafe `public` schema owner/ACL/search-path, stale-object or catalog-collision
  posture;
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

## Historical R5 writer map — superseded by final closure

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

### Test/support — maximum five

5. `packages/database/test/migration-execution-kernel.test.ts` — positive
   schema-absent, table-absent, empty-prefix, partial-prefix and all-applied
   cases.
6. `packages/database/test/migration-execution-faults.test.ts` — abort, lock,
   callback, drift, catalog, ACL, session and cleanup failures.
7. `packages/database/test/migration-execution.support.ts` — fresh no-volume
   disposable fixture and content-free removal receipt.
8. `packages/database/test/migration-callback-boundary.test.ts` — restored
   structural proof for exact private readers/issuers and consumers, absent
   package/runtime exports, the sole `.unsafe` sink and line/file ceilings.
9. `packages/database/test/migration-execution-boundary.test.ts` — moved
   execution-path, stale-object/collision and version-aware PostgreSQL 15/16
   boundary cases.

### Deterministic only

10. `scripts/repo-size-budget.json`, only when changed by the unchanged
    repository-size sync generator after all intended paths are staged.

Ten paths is the absolute ceiling. Any fifth production/config path, sixth
test/support path, eleventh total path, `migrate.ts`, `package.json`, package
export/script, workflow, Docker/compose, CI, canonical migration/journal,
database client, seed, app, proxy, route, auth/session/OTP, tenancy/RLS,
billing, UI/i18n, provider, deployment, README, AGENTS or architecture-doc
change stops for fresh authority.

Every new source/test/support file must stay below 150 physical lines. The hard
allocation is 1,150 changed lines, 2.5 engineering days and one backend
execution-kernel outcome.

The frozen R3 candidate currently measures 61 lines for
`migration-execution-bootstrap.ts`, 148 for `migration-execution-kernel.ts`,
125 for `migration-execution-faults.test.ts`, 147 for
`migration-execution-kernel.test.ts`, and 141 for
`migration-execution.support.ts`. R4 must place the fixed inventory in the
bootstrap module, keep kernel path/revalidation changes within 150 lines, and
use the existing faults/support test paths without pushing any new or
substantially refactored source/test/support file above 150. If that allocation
does not fit after formatting and review, the unchanged writer-map claim fails
and implementation stops.

At R5 stop, the preserved candidate has nine changed paths and 1,137 changed
lines. Its replacement boundary diff accounts for 275 of those lines (137
additions plus 138 removals). Restoring the base structural body removes that
275-line replacement diff, leaving 862 changed lines before R5. The new
integration file may add at most 149 lines, while all structural-list and
version-aware production adjustments together may consume at most 40 changed
lines. The resulting bounded projection is at most 1,051 changed lines, leaving
99 lines of contingency under the unchanged 1,150 ceiling. The final ten-path
patch, including optional deterministic metadata, must still measure at or
below 1,150 changed lines; this projection is not a waiver. R5 authorizes
neither an additional production file nor a line/time ceiling increase.

## Final consolidated implementation writer map and budget

After this authority merges and a new exact runtime receipt is accepted, only
the following required/current candidate paths may differ from the final
authority base:

1. `packages/database/src/migration-execution-contracts.ts`
2. `packages/database/src/migration-execution-bootstrap.ts`
3. `packages/database/src/migration-execution-plan.ts`
4. `packages/database/src/migration-execution-kernel.ts`
5. `packages/database/src/migration-ledger-inspection.ts`
6. `packages/database/test/migration-execution-kernel.test.ts`
7. `packages/database/test/migration-execution-faults.test.ts`
8. `packages/database/test/migration-execution.support.ts`
9. `packages/database/test/migration-callback-boundary.test.ts`
10. `packages/database/test/migration-execution-boundary.test.ts`
11. `packages/database/test/migration-ledger-inspection-faults.test.ts`
12. `packages/database/test/migration-ledger-lock-order.test.ts` — new live
    stale-then-fresh regression proof
13. `scripts/repo-size-budget.json` — unchanged deterministic generator output
    only

Two named contingencies are pre-authorized inside the same boundary:

14. `packages/database/src/migration-ledger-lock.ts` only when required to keep
    the reader lock/acquisition/cleanup state machine internal and
    `migration-ledger-inspection.ts` below 150 physical lines; it may have no
    package export, caller or semantic expansion;
15. `packages/database/test/migration-execution-lock-faults.test.ts` only when
    execution-fault proof must split to keep every touched test below its
    physical ceiling.

Fifteen diff paths is the absolute ceiling. The final patch may contain at most
1,500 insertions and 1,900 total inserted-plus-deleted lines against the final
authority base, at most 40,000 additional tracked bytes and two additional
tracked files against preserved head `cc3231a9…`, and at most three engineering
days. Every new or modified source/test/support file must remain at or below 149
physical lines. The one outcome remains an inert execution kernel plus a
coherent reader/writer lock contract.

The current ten-path candidate consumes 1,055 insertions, 59 deletions, 1,114
total changed lines, 59,158,692 tracked bytes and 5,607 tracked files. The
read-only generator check and `pnpm repo:size:check` pass. The final reserve is
therefore 445 insertions, 786 total changed lines, 40,000 tracked bytes and two
files. Any net growth must be synchronized through the unchanged deterministic
size generator in this PR; unrelated inflation is forbidden.

Any sixteenth path, ceiling overflow, `migrate.ts`, `apply-migration.ts`,
package export/script, migration/journal, database client, workflow/Docker/CI,
caller, app, proxy/routing/auth/tenancy/RLS, UI/i18n, billing, provider,
deployment, README, AGENTS or architecture-doc change stops. A helper/test split
inside paths 14-15 is contingency use, not an amendment trigger.

## Test-first and proof plan

The first final-closure implementation mutation, after a separate accepted
runtime receipt, is test-only: add the live waiting-reader regression to
`migration-ledger-lock-order.test.ts` and prove it fails against unchanged
production head `cc3231a9…` because the current inspector freezes its
repeatable-read snapshot before waiting on the transaction lock. The RED must
show the reader returning the stale prefix after the cooperating writer commits,
with production files and preserved stash unchanged. Only then may production
code or the writer cleanup path change.

Focused proof must cover:

- zero, one, 92 and 93 applied migrations;
- schema and table bootstrap with exact owner/ACL/serial shape;
- duplicate/gapped sequence IDs accepted only when ordered rows remain the
  exact hash/timestamp prefix;
- extra, reordered, mismatched, malformed or 94th rows rejected before
  callback execution;
- public/drizzle schema, table, sequence, column ACL and owner violations;
- the same version-aware role-capability probe passes on disposable
  PostgreSQL 15 and 16, rejecting a role that can assume the owner while
  admitting the fixture only after that membership is removed;
- create-then-revoke stale `public.now()` owned by a non-owner is rejected before
  the callback path, with zero marker side effect (no externally observable
  write from the planted function body) and total rollback;
- an owner-created catalog-colliding `public` routine is also rejected, while an
  owner-owned non-colliding application object does not create a false positive;
- the public-schema stale-object/collision probe runs once during validation and
  again immediately before the callback-path transition;
- forged/stale capability, corpus drift and dependency-source drift;
- exact pending offset and no replay of an applied callback;
- exact path transitions
  `pg_catalog, pg_temp → public, pg_temp → pg_catalog, pg_temp`, with implicit
  catalog-first resolution and public as the unqualified creation target only
  during authenticated callback execution, restored before the first
  post-execution read;
- an empty pending suffix never enters the callback-only path; ledger, plan and
  PID checks in steps 12 through 14 are observed only after a direct
  `pg_catalog, pg_temp → pg_catalog, pg_temp` transition to the
  post-execution validation path;
- every transaction-local path transition uses fixed `SET LOCAL`, and commit or
  rollback proves no callback or post-execution path leaks into the reserved
  session;
- every kernel-owned bootstrap, PID, lock, unlock, catalog and ledger statement
  satisfies the fixed-identifier/qualification contract, while callback failure
  proves rollback occurs before qualified unlock without error-path SQL under
  an attacker-resolvable name;
- the canonical migration `0000` callback sequence proves qualified callback
  items `0` and `1` and unqualified callback item `2` execute under the
  callback-only path, closing the focused Z620 RED contradiction;
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

The final closure additionally authorizes focused proof on task-owned disposable
PostgreSQL 15 and 16 instances and the current canonical Z620 profile. Each instance must be
created for this task, receive no volume, provider credential or default
database URL, and be removed with content-free evidence. This is local evidence
authority only: no repository Docker/compose, workflow, CI matrix, package
command or public-runner change is allowed.

For this docs-only final-authority patch, `scripts/repo-size-budget.json` is deterministic
metadata produced by the unchanged
`node scripts/repo-size-budget-sync.mjs --tracked-only` generator after the
three intended docs were staged. The generator and its contract are untouched.

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
tables and serial sequences. R5 resolved the discovered
`pg_has_role` privilege-keyword difference and requires focused PostgreSQL 15/16
evidence for that bounded contract. The kernel remains inert. P0a2 still owns
the permanent executable matrix, runtime-role fixture, workflow/Docker wiring
and complete certification of the exact merged kernel before adding any caller.
Any other server-major difference stops for fresh authority.

Only after P0a2 merges and closes green may fresh authority replan frozen
`IDA-UI03a2-P0` from then-current main. The old P0 implementation branch remains
evidence only and cannot supply source.

## Protected exclusions and stop conditions

No current source, test, migration, journal, database, provider, workflow,
environment, deploy, production alias or frozen state is touched by this gate.
No tenant, member, claim, draft, document, billing, health or other product data
is read or written.

Stop and return to current authority only if review shows:

- the fifteen-path/1,500-insertion/1,900-total-change/40,000-byte/three-day
  envelope is exceeded;
- safe execution needs `migrate.ts`, package/workflow/Docker wiring or P0a2;
- any callback can escape the one reserved transaction or the session lock
  cannot be acquired before `BEGIN` and reliably released afterward;
- public-schema posture cannot be proved before using it in `search_path`;
- callback/source/corpus equality cannot be rechecked before commit;
- the kernel would expose SQL, identifiers, credentials or raw errors;
- any default, retained, frozen, remote or provider database is needed;
- any second outcome or successor is requested;
- closure requires a fundamentally different architecture: a new caller,
  non-cooperating writer mutation, another lock keyspace, public API/workflow
  integration or protected path outside the final map.

An implementation correction inside the named lock/inspection files, same
reader/writer contract and ceilings is already authorized contingency and is not
an amendment trigger.

## Current gate blockers

1. The canonical docs-only final consolidated authority has not merged.
2. Clean then-current main has not been re-proved synchronized and the repo
   resolver has not re-proved exactly `IDA-UI03a2-P0a1a1b`.
3. AI OS has not been freshly observed after the final authority merge and its advisory drift
   classified against canonical repo authority.
4. Every R2-R5 runtime receipt is superseded for resume purposes; a replacement
   exact receipt does not yet bind merged final authority, preserved worktree/branch/head,
   exact patch and stash identities, first RED, writer map, ceilings, forbidden
   surfaces and final human-merge hold.
5. The first final-closure test-only RED receipt has not proved unchanged
   production head `cc3231a9…` returns the stale ledger prefix after a waiting
   reader's cooperating writer commits.

Until all five are closed, the repo resolver may continue to identify the sole
promoted `IDA-UI03a2-P0a1a1b` slice, but implementation remains paused. No
implementation edit, branch push, PR, database/provider contact or deployment
action is authorized by this amendment.
