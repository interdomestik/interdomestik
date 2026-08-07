---
gate_id: IDA-DG29
sole_slice: IDA-UI03a2-P0a2a
classification: architecture-security-prerequisite
risk_tier: 3
base_sha: e914caff0efe935ca6b990e4ddc5cebf08a8796b
runtime_authorized: false
deployment_authorized: false
production_authorized: false
status: proposed_pending_exact_hash_approval
---

# IDA-DG29 — UI03a2 P0a2a PostgreSQL 16 Runtime-Role Fixture

## Promotion decision

Propose exactly one prospective Tier 3 prerequisite slice:
`IDA-UI03a2-P0a2a — disposable PostgreSQL 16 migration-owner/runtime-role fixture
and redacted ownership/default-ACL manifest`.

This is a docs-only design gate. It grants no source, test, database, Docker,
provider, workflow, deployment, production or runtime authority. Promotion may
occur only after Arben accepts the exact bytes and SHA-256 of this file, the
docs-only authority PR merges, and the canonical resolver selects only
`IDA-UI03a2-P0a2a`. A separate runtime receipt bound to the then-current main,
task, thread, worktree, writer map and admission digest is required before the
first test or implementation mutation.

The pre-gate canonical state on the base above is
`blocked_requires_current_authority`, `activeSlice=null`, runtime not authorized.
The merged `IDA-UI03a2-P0a1a1b` kernel from PR `#1455` remains complete historical
work and is not reopened or recertified. Its closeout expressly assigns the
distinct runtime-role fixture, ownership/default-ACL manifest, permanent
PostgreSQL matrix, seed/runtime propagation and public integration to P0a2. This
gate selects only the smallest first child of that residual.

## Why this child is first

The parent P0a2 residual is not one admissible slice. A permanent PostgreSQL
15/16 matrix, role fixture, privilege propagation, package/public runner,
Docker/workflow wiring and CI integration have independently invalidatable
proof surfaces and failure modes. Combining them would repeat the oversized
slice pattern that lengthened earlier UI work.

P0a2a establishes one reusable security fixture on PostgreSQL 16 before any
public runner or workflow can consume it. Later gates may separately consider:

- PostgreSQL 15 parity for the accepted fixture contract;
- seed/application-runtime privilege propagation and least-privilege behavior;
- package/public runner and permanent Docker/workflow/CI integration.

Those successors are not promoted here. Frozen `IDA-UI03a2-P0`, parent
`IDA-UI03a2`, Hero redesign and membership dashboard remain separate and
unpromoted.

## Primary value and exact outcome

The primary beneficiary is the Interdomestik delivery team, and the downstream
user value is safe progress toward deliberate saved-draft-to-claim handoff
without running canonical migrations under an application role or a superuser.

One focused-test-owned disposable PostgreSQL 16 fixture must:

1. create a database owned by a dedicated migration owner;
2. pre-create a distinct canonical `interdomestik_runtime_rls` login role that
   is `NOSUPERUSER`, `NOBYPASSRLS`, `NOREPLICATION`, `NOCREATEDB`,
   `NOCREATEROLE` and not the database, schema, ledger or application-object
   owner;
3. execute the already-merged canonical migration kernel only through the
   preflighted migration-owner session;
4. produce a bounded, redacted manifest of role posture, database/schema/object
   ownership, schema privileges and default ACLs; and
5. attempt exact cleanup on success, failure, abort and assertion failure; PASS
   only after its container, sessions and dynamic identifiers are absent, or
   fail closed with the identity/cleanup receipt retained when container identity
   or removal cannot be resolved safely.

The fixture proves the separation boundary and current post-migration manifest.
It does not grant the runtime role application privileges, claim that seeding or
the application already works under that role, or expose a production migration
command.

## Existing authority retained

- Supabase Auth, Better Auth and `@interdomestik/shared-auth` remain unchanged.
- `apps/web/src/proxy.ts`, canonical routes and every `*-page-ready` marker are
  read-only and outside the writer map.
- The existing private migration callback-plan, ledger inspection and execution
  kernel APIs remain unchanged and non-exported.
- A new bounded lifecycle helper owns container create/start/identity/cleanup. A
  container-local control bootstrap session connected to `postgres` may create
  the disposable roles and database. A separate target bootstrap session then
  connects to that disposable database to normalize `public` ownership. Both
  close before preflight. After bootstrap, the migration owner is the only
  executor of canonical migration DDL. The
  application runtime role never receives database ownership, schema ownership,
  `BYPASSRLS`, `SUPERUSER`, replication or migration capability.
- The fixture may contact only its own loopback disposable PostgreSQL 16
  container on Z620 through the governed heavy/shadow route.
- No Supabase, Vercel, GitHub provider resource, shared database or production
  endpoint is contacted.

## Exact writer map

The future implementation may touch only these seven paths:

1. `packages/database/test/migration-runtime-role-lifecycle.support.ts` — new
   exact-identity container create/start/cleanup and failure-receipt helper;
2. `packages/database/test/migration-runtime-role-fixture.support.ts` — new
   bootstrap, distinct-role and owner/kernel orchestration helper;
3. `packages/database/test/migration-runtime-role-manifest.support.ts` — new
   bounded catalog query, normalization and redaction helper;
4. `packages/database/test/pg16/migration-runtime-role-fixture.test.ts` — new,
   explicitly addressed PostgreSQL 16 behavior/cleanup contract outside the
   ordinary `test/*.test.ts` collector;
5. `packages/database/test/migration-runtime-role-fixture-boundary.test.ts` —
   new static caller, import, command, redaction and forbidden-surface contract;
6. `packages/database/package.json` — one explicit focused test command; and
7. `scripts/repo-size-budget.json` — deterministic inventory delta only if the
   unchanged canonical sync requires it.

No eighth path is allowed. Existing migration-execution and admin-connection
support may be imported read-only but not modified. The new lifecycle helper
owns only container mechanics and is reused by the new fixture helper; it does
not copy migration plan or kernel logic. The fixture reaches the admin preflight
only through the existing dynamic-import seam so the static import sentinel
remains unchanged. Every new TypeScript file must remain at or below 150 lines.
Discovering that the fixture cannot fit this map is a stop-and-re-gate condition,
not permission to modify the kernel or an existing 147–150-line file.

## Contract and dependency graph

The package script key and value are exact:
`"test:migration-runtime-role": "tsx --test --test-concurrency=1 test/pg16/migration-runtime-role-fixture.test.ts"`.
The command does not self-set its required `IDA_PG16_FIXTURE=1` opt-in. The Mac
control plane supplies that flag only inside the governed Z620 invocation and
records an out-of-repo controller receipt bound to runner id, exclusive label,
host key, exact repo head, command digest, start/end timestamps and exit status.
The dynamic proof is invalid without that non-self-issued receipt.

The lifecycle helper generates one random name with fixed P0a2a labels, uses
`docker create` to obtain the immutable container ID before `docker start`, then
atomically persists the ID/name/labels in a mode-`0600` out-of-repo receipt. A
failure to persist the initial planned-name/fixed-label receipt stops before
`docker create`. If create returns a known ID but atomic receipt upgrade fails,
the container must not start and database work must not begin; the helper uses
the in-memory exact ID for cleanup and retains the already-durable planned
receipt unless exact-ID absence and planned-receipt deletion are both proven.
A retained planned receipt is reconciled later only by exact-name inspection,
label verification and immutable-ID capture before deletion. A
non-success, timeout or lost response from `docker create` is ambiguous, not proof
that no container exists. The helper must inspect the exact planned name (never a
label-only or glob lookup): a matching fixed-label container recovers and persists
its immutable ID before exact-ID cleanup; a definite no-such-container result
deletes the planned receipt and returns the fixed construction failure; a label
mismatch or indeterminate inspection never deletes a container and retains the
planned-name/fixed-label receipt under `CONTAINER_IDENTITY_UNRESOLVED` for
separately authorized exact-name reinspection. A construction failure with a
known ID must attempt removal of that exact ID before returning. Exact-ID removal
failure or ambiguity is governed by the retained-receipt contract below and must
dominate the result.
The fixture helper opens one trust-auth container-local control bootstrap session
against `postgres` to create the migration owner, canonical runtime role and
disposable database. It then opens a separate trust-auth target bootstrap
session against that disposable database to recreate `public` under the
migration owner and revoke `CREATE` from `PUBLIC` and the runtime role. Both
bootstrap sessions close before preflight. The existing
authenticated callback-plan capability and dynamic-import preflighted
owner-session/kernel seam perform the canonical migration work. The manifest
helper uses the preflighted migration-owner session or its own loopback final
verifier session. The verifier captures/proves absence for exposed bootstrap,
owner and manifest-session pids after their successful closes. Because rejected
admin preflight exposes no pid, the verifier instead polls the isolated container
for zero rows with exact application name `interdomestik_admin_config_v1` after
the rejection returns; callback count remains zero. The verifier then closes;
its own absence is proven by successful exact-ID container removal, avoiding an
infinite observer-of-observer contract. Any failed close must not block removal
and follows the cleanup state machine below. The manifest returns a frozen
redacted summary and never returns URLs,
passwords, dynamic role/container names, SQL bodies or object names outside the
fixed allowlist.

The non-globbed dynamic test is the sole runtime consumer. The root-level
boundary test is intentionally collected by the ordinary `test/*.test.ts` lane
but is static and must not start Docker. Existing migration tests and application
runtime code do not import any new helper. The dynamic test fails when
`IDA_PG16_FIXTURE` is absent or not exactly `1`, or when Docker/PostgreSQL/
capability evidence is missing. The boundary test statically rejects `skip`, `todo`,
conditional skip guards or a command that does not name the exact dynamic file;
it pins the complete package script literal and proves the script does not set
the opt-in itself. The controller receipt is validated separately before its
result can count as Z620 evidence.
`findAdminPreflightImports()` must continue to return exactly its two existing
entries.

## Acceptance matrix

### A. Role and endpoint isolation

- Both bootstrap sessions and the observer report server major exactly 16 before
  any migration callback; the post-operation summary confirms the same major.
- The container is owned by the exact focused test invocation, loopback-only and
  randomly named by the new lifecycle helper. Host is exactly `127.0.0.1`,
  `NODE_ENV=test`,
  `ADMIN_DB_LOCAL_SCRATCH=1`, and the database name begins with the required
  `interdomestik_admin_config_p0a2a_` prefix.
- Migration owner and runtime role are login roles with `NOSUPERUSER`,
  `NOBYPASSRLS`, `NOREPLICATION`, `NOCREATEDB` and `NOCREATEROLE`; neither is
  `postgres`, `anon`, `authenticated`, `service_role` or
  `interdomestik_rls_test`. The preflight authority receipt pins
  `expectedRolsuper:false` and `expectedRolbypassrls:false` as literals.
- The migration owner owns the disposable database. The runtime role owns no
  database, schema, table, sequence, function or migration ledger object.
- The runtime role has no membership, `SET`, admin-option or inheritance path to
  the migration owner, `pg_read_all_data`, `pg_write_all_data` or another
  privileged role.
- The runtime role is rejected through the admin-connection seam with exact code
  `ADMIN_DB_PREFLIGHT_ROLE_REJECTED` and cannot invoke the kernel through the
  fixture; the operation callback call count remains exactly `0`. Because that
  seam does not expose the rejected pid, the final verifier proves cleanup by
  polling `pg_stat_activity` to zero rows for exact application name
  `interdomestik_admin_config_v1` inside the isolated container.

### B. Existing kernel execution

- The exact authenticated 93-entry callback plan is built from the canonical
  corpus without copying migration SQL into the fixture.
- Before that plan runs, fixture bootstrap recreates `public` owned directly by
  the migration owner and revokes `CREATE` from `PUBLIC` and
  `interdomestik_runtime_rls`; this is fixture setup, not kernel behavior.
- The preflighted migration-owner session invokes the unmodified kernel once.
- Success reports the existing frozen contract version, exact plan digest,
  `applied_total:93`, committed transaction, released lock and completed
  execution.
- A second owner invocation returns the existing zero-pending/idempotent result
  with `applied_before:93` and `applied_now:0`, without changing the ledger or
  manifest.
- Callback, manifest or assertion failure cannot be converted into success and
  must still run exact cleanup.

### C. Ownership and default-ACL manifest

- Fixed catalog queries record server major; database owner and ACL posture;
  role membership; the owners of `public`, `drizzle`, the Drizzle ledger,
  ordinary/partitioned tables, views/materialized views, sequences,
  functions/procedures/aggregates and types/domains; effective `PUBLIC`/runtime
  database `CONNECT`/`CREATE`/`TEMP`, schema `USAGE`/`CREATE`, relation
  `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER`, sequence
  `USAGE`/`SELECT`/`UPDATE`, function `EXECUTE` and type `USAGE`; and
  `pg_default_acl` rows relevant to the migration owner.
- The manifest proves that `PUBLIC` and the runtime role lack `CREATE` on
  `public`, that the runtime role owns no inspected object, and that it holds no
  relation DML privilege. Database defaults and any effective `PUBLIC` function
  or type privilege are characterized, not silently treated as absent.
- The current corpus is expected to produce `default_acl_rows:0`; absence is
  normalized explicitly to PostgreSQL engine defaults rather than interpreted
  as a grant-free runtime contract.
- The current manifest is characterization evidence only. Absence of future
  application grants is not treated as runtime readiness; seed/runtime
  propagation remains a later P0a2 child.
- Output contains only fixed posture booleans, counts, server major, object-class
  labels and SHA-256 digests. It contains no credentials, connection URLs,
  dynamic identifiers, raw ACL arrays, migration SQL or arbitrary database
  errors.

### D. Cleanup and negative paths

- Success, preflight rejection, kernel failure, manifest rejection,
  `AbortSignal`-driven abort and assertion failure all attempt to close both
  bootstrap sessions plus owner/manifest sessions. The final verifier proves
  captured pids absent after successful closes and proves zero exact
  `interdomestik_admin_config_v1` rows for the rejected preflight session, then
  closes before lifecycle cleanup runs exactly once. The verifier does not make
  an impossible proof about its own closed pid; successful exact-ID removal
  proves it and every remaining owned session absent. Any failed close still
  proceeds to removal in `finally`. Process-signal recovery where test hooks
  cannot run is outside this child.
- Identity or cleanup failure dominates the result and leaves a safe
  identifier-free error code plus an operator-visible receipt; it never reports
  PASS. Before start, the lifecycle helper atomically writes a mode-`0600`
  out-of-repo receipt with planned name/fixed labels; after a successful or
  reconciled `docker create`, it replaces that receipt with immutable container
  ID/name/verified labels before start or database work. Initial planned-receipt
  failure stops before create. Receipt-upgrade failure stops before start, uses
  the in-memory ID for exact cleanup and retains the durable planned receipt if
  either absence or receipt deletion cannot be proven. A failed or timed-out
  exact-ID removal is also reconciled by inspecting that exact ID: definite
  absence completes cleanup and deletes the receipt; presence or indeterminate
  inspection retains the immutable receipt and fails. A planned receipt is
  deleted only after definite no-such-container reconciliation, while a verified
  immutable receipt is deleted only after proven exact-ID absence. Label-only,
  globbed or broad deletion is forbidden. Receipts are never serialized into
  TAP, errors, stdout/stderr or CI artifacts.
- Every Docker and PostgreSQL rejection is caught by the new helpers, which
  discard raw command/provider text and emit only fixed identifier-free codes.
- An initial planned-receipt failure proves that `docker create` was never
  invoked. For every later terminal case in which exact-ID removal succeeds, the
  test proves no matching lifecycle-owned container or session remains,
  including receipt-upgrade, create/start/readiness/bootstrap and session-close
  failures. A removal-failure
  case instead proves FAIL, proves that no broader container deletion was
  attempted and retains the verified immutable receipt. An unresolved create
  identity retains only the planned-name/fixed-label receipt and permits no
  deletion until separately authorized exact-name inspection verifies labels and
  captures the immutable ID. Neither case makes a false absence claim for a
  retained container or an unproved session; container and session absence are
  asserted only after exact identity is reconciled and exact-ID recovery
  succeeds.
- Missing Docker, missing image, wrong server major, insufficient resource
  floor, unavailable Z620 or a skipped required case is a failed proof, not a
  waiver.

## Highest-risk cases

1. A superuser or `BYPASSRLS` role makes the proof falsely green.
2. The runtime role becomes database/schema/object owner or receives `CREATE` on
   `public` through default privileges.
3. The fixture accidentally invokes the kernel under the runtime role.
4. Dynamic credentials, role names, URLs, SQL or catalog details escape through
   output, thrown errors or test diagnostics.
5. Ambiguous create/removal results are treated as absence, cleanup removes a
   container other than the exact lifecycle-owned fixture, or retained state
   lacks the bounded identity/recovery receipt needed for safe reconciliation.
6. A PostgreSQL 15 result is presented as PostgreSQL 16 evidence, or this
   single-version proof is presented as the permanent 15/16 matrix.
7. The fixture reaches a shared, Supabase, provider or production database.
8. A skipped suite, missing flag or absent Docker capability is reported as
   acceptance evidence.

## TDD and evidence order

After separate runtime authority, the first implementation action is a RED
`test/pg16/migration-runtime-role-fixture.test.ts` invoked through the future
focused package command. It must fail because the fixture/manifest implementation
is absent, while naming the expected distinct-role, owner-only-kernel and cleanup
contract. No support implementation may precede that RED.

Evidence order is fixed:

1. focused static boundary RED/GREEN;
2. exact Z620 PostgreSQL 16 resource/image/query canary;
3. controller receipt proving runner id/exclusive label, host key, exact head and
   command digest, followed by focused dynamic fixture RED/GREEN with
   `IDA_PG16_FIXTURE=1` and zero skipped cases;
4. local/Z620 `pnpm --filter @interdomestik/database test:unit` enforcement of
   the static boundary, followed by modularity, DB-access guard and
   repository-size checks; the boundary is deliberately not yet wired into a
   GitHub merge-authority lane because public CI wiring belongs to a later child;
5. early exact-head reviewer/Sonar/feedback intake after PR creation;
6. `pnpm pr:verify`, `pnpm security:guard` and one `pnpm e2e:gate` authority
   lane through CI on the exact PR head; and
7. final exact-head CodeQL, gitleaks, pnpm-audit, Sonar, reviewer threads and
   `pr-finalizer` disposition.

Only evidence invalidated by a changed head, path, contract surface or
environment fingerprint is rerun. A stale-head Z620 or CI job is cancelled, not
counted. Mac remains control plane/light writer and does not start Docker.

## Special proof environment

The only special environment is Z620 with its exclusive
`interdomestik-z620-staging` allocation. Before dynamic proof it must report:

- at least 30 GiB free disk and 8 GiB available memory;
- runner connected and listening, not merely service-active;
- no conflicting heavy-job lease;
- Docker and Node/pnpm versions required by the repository; and
- an exact-canary-owned PostgreSQL 16 container that reaches `pg_isready`,
  reports server major 16, accepts one fixed query, and is removed by an EXIT
  trap.

The dynamic fixture itself runs only after the Mac control plane verifies GitHub
runner id `24` is online/idle with exclusive label
`interdomestik-z620-staging`, pins the configured SSH host key, and records the
exact head plus SHA-256 of the literal package command in its controller receipt.
The Z620 result is rejected if receipt identity, head, command digest or terminal
exit status does not match.

This is supporting/exact-environment evidence, not merge authority. GitHub-hosted
Ubuntu remains merge authority. No deployment/CD run is required or authorized.

## Review plan

Before promotion, one bounded Opus 5 architecture/security review should inspect
this exact gate and current source with read-only tools, focusing on whether the
split is atomic, whether the manifest can leak or overclaim, whether the owner
and runtime roles are meaningfully distinct, and whether the writer map can
prove cleanup without modifying the kernel. A blocked route is recorded with
exact elapsed/error evidence and is not counted as PASS. One approved fallback
is sufficient only if Opus is technically unavailable or quota-blocked.

After implementation, the same senior route or approved fallback reviews the
complete exact-head diff once. Repository gates, CI, Sonar, CodeQL, security,
Copilot feedback and finalizer remain authoritative.

## Rollback and mitigation

Rollback is one revert of the future implementation merge. The fixture creates
only test-invocation-owned disposable state and must attempt exact-ID deletion
in every in-process terminal path; successful removal is asserted before PASS,
so there is no schema, data, user, provider or production rollback. If exact
identity is known but cleanup cannot be proven, retain only the mode-`0600`
out-of-repo receipt's immutable container ID, generated name, verified fixed
labels and timestamp, then require separately authorized exact-ID cleanup. If
create identity itself is indeterminate, retain only planned name, fixed labels
and timestamp, then require separately authorized exact-name inspection, label
verification and ID capture before any deletion. Never infer or broaden the
cleanup command. A fixture, identity or cleanup failure invalidates the manifest
as evidence.

The promotion is withdrawn if implementation requires a kernel edit, canonical
migration/journal change, persistent role/provider mutation, second PostgreSQL
major, workflow/Docker integration, seed/application propagation, an eighth
writer, or a second independently invalidatable outcome.

## Forbidden surfaces and non-goals

Forbidden:

- every product/UI/i18n/E2E product-flow file;
- `apps/web/src/proxy.ts`, routes, auth/session/OTP, tenancy and RLS policies;
- all existing migration-execution, admin-connection and ledger source/test
  files;
- `packages/database/src/migrate.ts`, canonical migrations and journal;
- root `package.json`, Docker/Compose, GitHub/Forgejo workflows and runner config;
- seed/application runtime propagation, public migration runner and PostgreSQL
  15 matrix;
- Supabase, Vercel, deployment, aliases, production and real customer data;
- claim/draft/membership/billing writers, parent UI03a2 behavior, Hero redesign
  and membership dashboard;
- Brain controller/config/freeze changes, M6 activation, M7 enrollment and Atlas.

A Sonar duplication finding caused by moving the dynamic proof below
`test/pg16/`, or any need to edit `sonar-project.properties`, is a
stop-and-re-gate condition. Each of the three named support files—
`migration-runtime-role-lifecycle.support.ts`,
`migration-runtime-role-fixture.support.ts` and
`migration-runtime-role-manifest.support.ts`—must not declare a local binding
named `db`, `dbAdmin` or `dbRls`; credential-shaped values must remain inside the
bounded fixture construction seam.

No Codex Security diff scan is required at this docs-only checkpoint. Future
implementation still requires applicable repo-native security evidence. Brain
remains advisory, no Brain product session is opened by this design gate, and no
M7 cohort claim is made.

## Stop conditions

Stop before mutation or promotion for an unclean/stale base, resolver conflict,
unapproved exact hash, admission result other than `ready`, missing Z620 canary,
review blocker without accepted disposition, hidden shared consumer, new writer,
new proof environment, persistent resource, shared/production endpoint, raw
secret/dynamic-identifier output, protected-surface need or any attempt to claim
P0a2/parent UI03a2 completion from this child.

The only next action authorized by this proposed document is exact-byte/hash
review and Arben approval. Runtime remains false.
