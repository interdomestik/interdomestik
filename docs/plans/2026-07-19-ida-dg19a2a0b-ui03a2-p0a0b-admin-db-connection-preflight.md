---
title: IDA-DG19-A2a0b — Reserved-session administrative DB connection preflight
date: 2026-07-19
status: accepted
authority: canonical_design_only
runtime_authorized: false
promoted_slice: IDA-UI03a2-P0a0b
accepted_payload_sha256: 9fd547f0ba5442e52c9910dd42f11715ec959990fe045afee88c7c25d1b85cac
accepted_payload_bytes: 29083
base_sha: 5ff6c1b56eac1fa095f63e11d8b6109a330ff701
risk_tier: 3
human_useful: unknown_not_confirmed
---

# IDA-DG19-A2a0b — Reserved-session administrative DB connection preflight

This docs-only gate records the delegated orchestrator's exact acceptance of the
reserved-session live-preflight prerequisite and promotes only
`IDA-UI03a2-P0a0b`. Completed `IDA-UI03a2-P0a0a` remains unchanged, while
`IDA-UI03a2-P0` stays blocked and frozen. No source, test, database, migration,
provider, deployment or production-alias work is authorized by this document.

The JSON between the fences is the exact accepted UTF-8 payload. Hash the bytes after
the opening fence's LF through and including the payload's terminal LF immediately
before the closing fence; exclude only the fence bytes. The payload is exactly 29,083
bytes and its SHA-256 is recorded in frontmatter.

```text
{
  "schema_version": "interdomestik_design_gate_v1",
  "gate": {
    "gate_id": "IDA-DG19-A2a0b",
    "slice_id": "IDA-UI03a2-P0a0b",
    "human_title": "Preflight i lidhjes administrative DB",
    "english_title": "Reserved-session live preflight for the administrative database connection",
    "classification": "promotion/design-gate",
    "future_runtime_risk_tier": 3,
    "status": "proposed_pending_exact_review_and_orchestrator_acceptance",
    "runtime_authorized": false,
    "candidate_count": 1,
    "sole_candidate": "reserved_session_admin_connection_live_preflight",
    "primary_user": "The future IDA-UI03a2-P0a1 safe migration executor",
    "business_outcome": "Fail closed before any migration when the explicit administrative connection does not reach the expected writable primary database through one stable, verified, database-owner session.",
    "entry_point": "Internal withPreflightedAdminConnection(env, nowEpochMs, signal, authorization, operation) function imported only by relative path; no package export, command, workflow, migration caller or current runtime caller is added.",
    "exit_states": [
      "accepted: the supplied internal operation runs once on the same reserved Postgres.js session that passed the live preflight, then the reserved client and one-connection pool are closed",
      "rejected: the operation is never invoked and a stable redacted code is returned after bounded teardown"
    ]
  },
  "authority": {
    "repository_commit": "5ff6c1b56eac1fa095f63e11d8b6109a330ff701",
    "origin_main_commit": "5ff6c1b56eac1fa095f63e11d8b6109a330ff701",
    "previous_slice": "IDA-UI03a2-P0a0a completed by PR #1382 and closeout PR #1383",
    "resolver": "blocked_requires_current_authority with activeSlice=null",
    "candidate_evidence": [
      "docs/plans/current-program.md lines 1143 and 1160-1164 explicitly name P0a0b before P0a1/P0a2 while leaving all three unpromoted",
      "docs/plans/current-tracker.md rows 109-110 and proof rows 1187-1188 block P0 on P0a0b and P0a2",
      "docs/plans/2026-07-19-ida-dg19a2a0a-ui03a2-p0a0a-admin-db-connection-config.md assigns client construction, live TLS, CA-to-endpoint evidence, cancellation/teardown, reserved-session identity/posture/state proof, scratch/fixture authority and integration tests to P0a0b"
    ],
    "ai_os_observation": "8773f86a5e077f6d31ae523e033b5449b907786af4c0aa46266a488db50f85f2",
    "ai_os_state": "Interdomestik authority=current, activeSlice=none, runtime=not_authorized; Brain=current; integrity diagnostics advisory",
    "active_execution": "thread 019f7b9e-9943-7f13-b3f2-2fc2ba2c5c9d, worktree ecea/interdomestik-crystal-home, head 5ff6c1b56, clean detached origin/main, advisory_only",
    "brain_disposition": "The authority query missed the tracker target; the exact source/test query found the P0a0a authority document. One narrow repo recovery established the exact current tracker sequence. Brain and Obsidian remain advisory.",
    "mcp_disposition": "interdomestik_qa is callable but hard-rooted through MCP_REPO_ROOT to the quarantined canonical checkout on obsolete dirty branch codex/ida-ui03a2-p0a-promotion; it is excluded after the root check. Shell evidence from the isolated worktree governs."
  },
  "binding_contract": {
    "configuration": "Call resolveAdminConnectionConfig(env, nowEpochMs) first and call postgres(config.toPostgresOptions()) only after it succeeds. Never call postgres(url), read alternate credentials, widen endpoints, weaken TLS, mutate env or log input.",
    "pool_and_reservation": "Construct exactly one Postgres.js pool with the accepted max=1 options, reserve exactly one client with await sql.reserve(), and run every preflight query, the supplied operation and postflight query through that reserved client. No shared/global client or cache is permitted.",
    "probe": {
      "shape": "The P0a0b wrapper owns exactly two fixed parameterized SELECT statements: a preflight before the operation and a postflight after it. Its probes contain no unsafe(), dynamic identifiers, multiple statements, DML, DDL, advisory lock, SET, transaction control, Drizzle migrator or migration-folder read. The trusted callback is a separate full administrative capability intentionally reserved for later P0a1 and is not falsely described as SELECT-only.",
      "session_identity": [
        "session_user equals current_user",
        "current_user equals the private username from accepted Postgres.js options",
        "current_database() equals the private database from accepted Postgres.js options",
        "pg_backend_pid() is identical in preflight and postflight",
        "application_name equals interdomestik_admin_config_v1"
      ],
      "role_posture": [
        "the exact current role has rolcanlogin=true and rolreplication=false",
        "the exact current role is the current database owner, not merely a member of the owner role; the exact catalog predicate SELECT d.datdba = r.oid FROM pg_database d JOIN pg_roles r ON r.rolname = current_user WHERE d.datname = current_database() must return one true row",
        "CONNECT, CREATE and TEMP database privileges are each true",
        "current role is not anon, authenticated, service_role, interdomestik_runtime_rls or interdomestik_rls_test",
        "rolsuper and rolbypassrls are compared to the exact booleans hash-bound in the local fixture or remote provider-authorization receipt and never logged; no unbound elevated posture is accepted"
      ],
      "state_and_transport": [
        "pg_is_in_recovery() is false",
        "transaction_read_only and default_transaction_read_only are off",
        "server_version_num is PostgreSQL 15.x or 16.x; the two-version executable matrix remains owned by P0a2",
        "local_scratch requires pg_stat_ssl.ssl=false",
        "supabase_direct requires pg_stat_ssl.ssl=true; successful connection through P0a0a's explicit CA, rejectUnauthorized=true, exact servername and built-in checkServerIdentity is the CA-to-endpoint/hostname evidence"
      ]
    },
    "authorization_binding": "Before postgres() construction, local_scratch requires a hash-bound disposable-fixture receipt; supabase_direct requires a hash-bound provider-authority receipt plus expected SHA-256 digests of the admitted hostname and decoded CA PEM and exact expected rolsuper/rolbypassrls booleans. P0a0b recomputes the endpoint and CA digests from the private accepted options and uses constant-time equality. A missing, malformed, wrong-kind or mismatched binding fails before connect. Receipts may preserve only their own SHA-256, endpoint digest, CA digest, expected posture booleans and environment class; never credentials, raw URL, raw host or CA bytes.",
    "operation_boundary": "Invoke the supplied internal operation only after the preflight passes and pass the reserved Postgres.js client plus the same AbortSignal. This callback is a trusted full administrative database capability: the wrapper cannot prevent DDL, DML, unsafe(), transient SET ROLE changes or non-database closure effects and postflight cannot undo them. P0a0b adds no current callback/caller and proves that with an import-graph test. P0a0b test callbacks are SELECT-only and signal-aware. P0a1 alone may later provide a DB-only migration callback after separately auditing every statement, transaction, lock and side effect under its own gate/runtime authority.",
    "cancellation_and_teardown": "Use a mandatory try/catch/finally lifecycle with states initial, reserving, preflight, operating, postflight, closing and closed. Register the AbortSignal listener before postgres()/reserve(), immediately recheck signal.aborted, and use one idempotent closeOnce promise. A final abort check immediately before callback invocation is the linearization point. The callback receives the signal and its promise is raced with abort; abort observed before callback settlement wins, callback failure beats postflight, postflight mismatch beats callback success, and cleanup failure replaces success but is attached only as a redacted cleanup code after an earlier rejection. Late abort before closed yields ABORTED; abort after closed has no effect. In closeOnce, reserved.release() is called synchronously at most once, then sql.end({timeout:1}) is awaited at most once; Postgres.js may reject/destroy pending database work after the one-second timeout. P0a0a's connect_timeout=5 bounds connection establishment. The guarantee is bounded database-session teardown and observer-proven session disappearance, not protocol-level cancellation or forced settlement of arbitrary JavaScript/non-database side effects. Trusted callbacks must be DB-only, signal-aware and separately audited by their owning slice.",
    "diagnostics": {
      "success_summary": [
        "contract_version: admin_connection_preflight_v1",
        "endpoint_class: local_scratch | supabase_direct",
        "session_reserved: true",
        "identity_verified: true",
        "database_owner_verified: true",
        "writable_primary_verified: true",
        "transport_verified: loopback_plaintext | explicit_ca_hostname_verified",
        "server_major: 15 | 16",
        "operation_completed: true"
      ],
      "stable_error_codes": [
        "ADMIN_DB_PREFLIGHT_CONFIG_REJECTED",
        "ADMIN_DB_PREFLIGHT_AUTHORITY_REJECTED",
        "ADMIN_DB_PREFLIGHT_ABORTED",
        "ADMIN_DB_PREFLIGHT_CONNECT_FAILED",
        "ADMIN_DB_PREFLIGHT_SESSION_CHANGED",
        "ADMIN_DB_PREFLIGHT_IDENTITY_REJECTED",
        "ADMIN_DB_PREFLIGHT_ROLE_REJECTED",
        "ADMIN_DB_PREFLIGHT_STATE_REJECTED",
        "ADMIN_DB_PREFLIGHT_TRANSPORT_REJECTED",
        "ADMIN_DB_PREFLIGHT_VERSION_REJECTED",
        "ADMIN_DB_PREFLIGHT_OPERATION_FAILED",
        "ADMIN_DB_PREFLIGHT_CLEANUP_FAILED"
      ],
      "redaction": "No URL, username, password, database, hostname, address, port, PID, role name, certificate data, SQL text, driver/server error, stack, cause or supplied operation error is returned, logged, serialized or exposed. Private in-memory inspection required by the binding checks is permitted. The module emits no stdout/stderr."
    }
  },
  "fixture_and_live_authority": {
    "local_lane": "Mandatory implementation proof uses a fresh standalone PostgreSQL 16 disposable container, a random unused host port, no shared volume, and a unique database beginning interdomestik_admin_config_p0a0b_. It must not use retained ida-p0-e477-postgres, port 55521, any default 54322 database, the canonical checkout, or another task's container. Before the system under test, the test-support module may perform fixture-only bootstrap DDL inside that disposable container to create one non-superuser database-owner login/database and one nonowner login; this carve-out never enters the production wrapper or callback. The runtime receipt records image ID/digest, container name, port, database prefix, exact expected rolsuper/rolbypassrls booleans, start/end timestamps and removal; it records no password or URL.",
    "local_posture": "The preflight target is the fixture-created non-superuser, non-BYPASSRLS database-owner login. The image bootstrap superuser exists only for fixture setup, independent pg_stat_activity observation and teardown; it is never the preflight success target and cannot support P0a2 least-privilege evidence.",
    "remote_lane": "Before claiming supabase_direct readiness, run the same read-only integration case once against an explicitly authorized disposable non-production Supabase project using its direct db.<20-char-ref>.supabase.co:5432 endpoint and downloaded CA. A separate provider-contact receipt must hash-bind the authorized environment class, receipt SHA-256, expected endpoint SHA-256, CA SHA-256 and exact expected rolsuper/rolbypassrls booleans; P0a0b compares them before connect and during posture proof. Any elevated remote posture requires an explicit provider-specific written waiver inside that receipt and grants no application-runtime authority. No Dashboard mutation, network-rule change, password rotation, migration, SQL write, deployment or production project is authorized.",
    "remote_stop": "If explicit non-production Supabase credentials, CA and provider-contact authority are absent, the remote lane is NON_PASS and P0a0b cannot close. Do not substitute a pooler, production project, TLS-disable flag, local DNS override, /etc/hosts mutation or mocked TLS proof.",
    "why_no_smaller_prerequisite": "The accepted P0a0a authority explicitly assigns scratch/fixture authority to P0a0b, so the fresh disposable local fixture is inside this candidate rather than a new invented slice. If the orchestrator declines that fixture or remote provider authority, return NON_PASS to current authority; do not invent a conflicting ID."
  },
  "exact_file_map": {
    "production_and_config_paths": [
      {
        "path": "packages/database/src/admin-connection-preflight.ts",
        "change": "new_internal_module",
        "responsibility": "One-client construction, reserve/preflight/operation/postflight lifecycle, stable results, cancellation and teardown.",
        "line_ceiling": 150
      },
      {
        "path": "scripts/repo-size-budget.json",
        "change": "conditional_deterministic_only",
        "responsibility": "Update only if the unchanged canonical generator requires inventory metadata; no manual semantic limit increase."
      }
    ],
    "test_and_support_paths": [
      {
        "path": "packages/database/test/admin-connection-preflight.test.ts",
        "change": "new_live_integration_test",
        "responsibility": "Static wrapper/import-graph guards plus mandatory disposable-local live posture, same-session, authorization rejection, abort and cleanup proof; explicit separately authorized non-production Supabase direct lane.",
        "line_ceiling": 150
      },
      {
        "path": "packages/database/test/admin-connection-preflight.support.ts",
        "change": "new_fixture_support",
        "responsibility": "Disposable-container-only owner/nonowner bootstrap, observer connection, PID-correlated cleanup polling and content-free fixture receipt helpers. It is test-only and performs no production or provider mutation.",
        "line_ceiling": 150
      }
    ],
    "explicitly_unchanged": [
      "packages/database/src/admin-connection-config.ts",
      "packages/database/test/admin-connection-config.test.ts",
      "packages/database/src/migrate.ts",
      "packages/database/src/db.ts",
      "packages/database/src/index.ts",
      "packages/database/package.json",
      "packages/database/drizzle/**",
      "package.json",
      "docker-compose.yml",
      ".github/workflows/**",
      "packages/database/test/rls-test-connection.ts",
      "apps/web/src/proxy.ts"
    ]
  },
  "test_map": [
    {
      "id": "P0a0b-T01",
      "case": "Static boundary",
      "proof": "Wrapper source contains one postgres(options) construction and reserve/release/end lifecycle, only two fixed SELECT probes, and no wrapper-owned unsafe SQL, DML/DDL, migration/Drizzle/fs/path/env mutation, global cache, console or raw-error output. Repo import graph proves no current caller. Trusted callback capability is explicitly excluded from the SELECT-only claim."
    },
    {
      "id": "P0a0b-T02",
      "case": "Disposable local happy path",
      "proof": "Two probes plus the read-only callback observe one PID, exact session/current/config identity, exact database owner, login/non-replication posture, writable primary state, expected application name, PostgreSQL 16 and ssl=false; success is fully redacted."
    },
    {
      "id": "P0a0b-T03",
      "case": "Wrong-role and authorization-binding denial",
      "proof": "A fixture-created nonowner login fails the exact owner-OID check after connect; wrong receipt kind, endpoint digest, CA digest or expected posture fails before connect. Every case prevents callback invocation, returns only a stable code and leaves no extra session."
    },
    {
      "id": "P0a0b-T04",
      "case": "Abort and bounded cleanup",
      "proof": "Table cases cover pre-abort, abort during reserve/connect, immediately before callback, during a signal-aware read-only pg_sleep callback, during postflight and during cleanup. The defined state/precedence result is redacted, closeOnce runs once, and an independent observer keyed by the retained in-memory PID and application_name sees the session disappear by polling every 50 ms for at most 2 seconds. The test claims DB-session teardown only."
    },
    {
      "id": "P0a0b-T05",
      "case": "Operation failure cleanup",
      "proof": "A unique thrown sentinel becomes ADMIN_DB_PREFLIGHT_OPERATION_FAILED, never appears in any representation/output, and leaves no reserved session."
    },
    {
      "id": "P0a0b-T06",
      "case": "Authorized Supabase direct TLS lane",
      "proof": "Against a disposable non-production project only, provider-receipt/endpoint/CA/posture digests bind before connect; the same identity/owner/writable-primary/same-PID checks pass and pg_stat_ssl reports ssl=true through the exact explicit-CA hostname-verified config. Missing provider authority is a hard NON_PASS, not a skipped PASS."
    },
    {
      "id": "P0a0b-T07",
      "case": "No current administrative caller",
      "proof": "The production wrapper owns only SELECT probes and has no package export/current import. P0a0b test callbacks and the remote lane are SELECT-only. Fixture-only local bootstrap DDL is isolated in test support and erased with the container. Future P0a1 callback writes remain outside this claim and require separate authority."
    }
  ],
  "verification_after_separate_runtime_authority": {
    "focused": [
      "pnpm --filter @interdomestik/database exec tsx --test test/admin-connection-config.test.ts test/admin-connection-preflight.test.ts",
      "pnpm --filter @interdomestik/database type-check",
      "pnpm check:modularity-guard",
      "pnpm check:db-access",
      "node scripts/repo-size-budget-sync.mjs --check"
    ],
    "mandatory_final": [
      "pnpm pr:verify",
      "pnpm security:guard",
      "pnpm e2e:gate"
    ],
    "heavy_job_rule": "Every database-heavy or mandatory gate runs through AI OS heavy-job preflight/run with explicit isolated URLs; no default database fallback is accepted.",
    "proof_limit": "P0a0b proves connection establishment, TLS/transport, identity, owner posture, writable-primary state, same-session handoff and cleanup. It proves no migration correctness, DDL/ownership result, advisory migration lock, runtime-role least privilege, PostgreSQL 15/16 matrix, seed/runtime propagation, workflow/deployment readiness or application tenant isolation."
  },
  "acceptance_cases": [
    "A01 exact current authority and resolver evidence bind only IDA-UI03a2-P0a0b",
    "A02 configuration failure constructs no client and invokes no operation",
    "A03 only postgres(config.toPostgresOptions()) is used and exactly one connection is reserved",
    "A04 preflight and postflight prove one unchanged backend PID, session/current/config identity and database",
    "A05 exact catalog OIDs prove current role is database owner; it is login-capable, non-replication, not an application/runtime role and matches receipt-bound superuser/BYPASSRLS posture",
    "A06 target is writable, not in recovery and PostgreSQL major is 15 or 16",
    "A07 local scratch is plaintext loopback only; Supabase direct is explicit-CA hostname-verified TLS only",
    "A08 operation never runs after any failed check and runs once only after all checks pass",
    "A09 the explicit lifecycle state machine linearizes pre-abort, reserve/connect, pre-callback, callback, postflight, cleanup and late-abort races with stable redacted precedence",
    "A10 every path calls synchronous release at most once, awaits one end({timeout:1}) promise and leaves no PID-correlated pg_stat_activity session by the exact observer deadline; no claim is made that arbitrary JavaScript is forcibly terminated",
    "A11 implementation emits no secrets, identifiers, SQL, driver/server errors, logs or telemetry",
    "A12 implementation adds no export, command, workflow, migration, DDL, provider mutation or current caller",
    "A13 local proof uses only a fresh disposable isolated fixture, permits bootstrap DDL only in test support, targets a non-superuser non-BYPASSRLS database owner and records removal",
    "A14 remote proof cryptographically binds the separate provider receipt, endpoint, CA and expected elevated posture before read-only non-production Supabase direct access",
    "A15 P0a1, P0a2, frozen P0 and frozen parent remain unpromoted and untouched"
  ],
  "abuse_controls": [
    "Fail closed before callback on config, endpoint, TLS, identity, database, ownership, role, version or state mismatch.",
    "No pooler, transaction endpoint, localhost name, custom DNS, alternate provider, system trust, TLS disablement, URL query or caller option bag is admitted.",
    "No username/database/role/pid/address/certificate or raw error appears in a receipt.",
    "The administrative connection is internal, uncached, max-one, reserved, short-lived, has no current caller and is never exported to application runtime.",
    "The callback is invoked once on the reserved session only after the linearization check; it is a trusted full administrative capability owned by P0a1, and P0a0b does not claim to detect transient changes that a callback restores.",
    "The wrapper probe SQL is fixed and read-only; no dynamic SQL or caller-supplied identifier reaches either probe.",
    "Remote connection attempts require constant-time match to provider-receipt, endpoint, CA and exact role-posture digests; syntactic Supabase hostname admission alone is insufficient authority.",
    "Provider contact is deny-by-default and restricted to an explicitly authorized disposable non-production project.",
    "Fixture names/ports are unique, volumes are absent, default/frozen databases are forbidden, and cleanup evidence is mandatory."
  ],
  "resilience_and_operations": {
    "failure_modes": "Authorization binding, DNS/connect/TLS/auth/query/abort/callback/postflight/cleanup failures follow the explicit terminal precedence, return stable categories and expose no operation result when trust is incomplete.",
    "observability": "The module logs and emits no telemetry. The caller receives only the bounded redacted summary/code. CI/PR logs and content-free fixture/provider receipts are durable evidence; allowed receipt fields are their SHA-256, endpoint/CA digests, expected posture booleans, environment class, image/container metadata and removal timestamps. Credentials, raw endpoint/CA, PID and database errors are excluded. Cleanup proof retains PID only in test memory and uses a unique observer application_name, 50 ms polls and a 2-second deadline; timeout is a failed test/CLEANUP_FAILED, never a warning.",
    "concurrency": "Each invocation owns one independent max-one pool and one reservation. No global state exists. P0a1 must later add the cross-process advisory migration lock; P0a0b adds none.",
    "performance_cost": "One connection, two small catalog/system SELECTs plus the future operation, connect timeout 5 seconds, caller abort bound and teardown timeout 1 second.",
    "support_diagnostics": "Stable code plus boolean/enum success summary only. Any need for raw errors requires a separately governed secure operator channel.",
    "rollout": "No feature flag or application rollout. Internal dead code until P0a1 is separately promoted. No deployment or alias."
  },
  "rollback": {
    "before_merge": "Delete only the future isolated P0a0b branch/worktree after preserving review/fixture receipts; remove its fresh disposable container. Do not touch frozen or quarantined state.",
    "after_merge_before_p0a1": "Revert the one internal module, one live test, one fixture-support module and conditional deterministic size metadata. No export or caller exists, so runtime behavior returns byte-for-byte to P0a0a-only state.",
    "after_p0a1": "Roll back P0a1 first, then revert P0a0b. P0a0b creates no database object or provider state to reverse."
  },
  "ceilings": {
    "production_and_config_paths": 2,
    "test_and_support_paths": 2,
    "engineering_days": 1.0,
    "backend_outcomes": 1,
    "new_dependencies": 0,
    "line_ceiling_production": 150,
    "line_ceiling_test_and_support": 150,
    "stop_rule": "Any third production/config path, third test/support path, any new file above 150 lines, package export/script/workflow/compose change, production-wrapper migration/DDL/DML/advisory lock, provider mutation, default/frozen DB contact, more than one day, or second outcome stops and returns to current authority. Disposable-container bootstrap DDL remains the only test-support carve-out."
  },
  "excluded_follow_ups": {
    "IDA-UI03a2-P0a1": "Owns safe same-session migration execution, trusted search_path, advisory migration lock, Drizzle/journal selection, DDL/ownership posture, runner caller/command and legacy migrate closure.",
    "IDA-UI03a2-P0a2": "Owns Docker/CI distinct runtime-role fixture, privilege/ownership/default-ACL/membership manifest, PostgreSQL 15/16 executable matrix, seed/runtime phase propagation, workflow wiring and least-privilege proof.",
    "frozen_P0_and_parent": "Remain blocked, frozen and untouched; P0a0b imports or executes none of their unmerged state."
  },
  "protected_exclusions": [
    "No apps/web/src/proxy.ts, canonical route, auth/session/OTP, shared-auth, tenancy or product UI change.",
    "No production/provider schema, migration, journal, RLS, grant, role, ACL, ownership, DDL, DML, advisory lock, seed, backfill or business-row access. The sole exception is pre-test owner/nonowner/database bootstrap inside the fresh no-volume disposable local container, erased by container removal.",
    "No package export, package script, workflow, docker-compose, CI topology, deployment, rollout, environment mutation, certificate download or production alias.",
    "No pooler, transaction-mode endpoint, runtime-role fixture, P0a1 runner behavior or P0a2 compatibility/least-privilege claim.",
    "No retained P0 container/database, default Supabase local DB, canonical contaminated checkout, frozen worktrees, PR #1380, provider production project or other IDA slice contact.",
    "No Paddle, uploads, documents, storage, compression, German, dashboard or redesign work."
  ],
  "primary_sources": [
    {
      "source": "https://github.com/porsager/postgres/tree/v3.4.9",
      "fact": "Postgres.js 3.4.9 exposes await sql.reserve(), reserved.release(), and sql.end({timeout}) for one-session work and cleanup."
    },
    {
      "source": "https://www.postgresql.org/docs/current/functions-info.html",
      "fact": "session_user, current_user, current_database and pg_backend_pid establish session identity and one backend; pg_is_in_recovery and catalog functions establish server state."
    },
    {
      "source": "https://supabase.com/docs/guides/database/connecting-to-postgres",
      "fact": "The db.<project-ref>.supabase.co:5432 direct endpoint is intended for migrations and persistent native sessions; pooler modes are separate."
    }
  ],
  "review_requirements": {
    "hash_binding": "Every reviewer independently recomputes and quotes the exact SHA-256 and UTF-8 byte count of this JSON artifact.",
    "architecture": "Judge the 1-module/1-test/1-support/conditional-size-metadata map, same-session handoff to P0a1, Postgres.js reserve/release/end semantics, no-current-caller boundary, fixture credibility, modularity and rollback.",
    "tier_3_security": "Judge endpoint/TLS binding, role/database-owner checks, superuser/BYPASSRLS treatment, callback capability, abort/cleanup races, redaction, no-write proof, remote-provider stop and frozen/default DB exclusions.",
    "routes": "Use repo wrappers with the full artifact and prompt inline through REVIEW_PROMPT. Sonnet and Gemini are required independent signals; Opus is the bounded escalation for blocked routes or unresolved Tier-3 findings. Fable is skipped unless callable access is first confirmed. Any unavailable/no-output/quota/path-policy/wrong-hash route is NON_PASS.",
    "internal_fallback": "If external required routes are blocked, use strongest reachable independent Sol XHigh architecture and security reviews on the exact hash. They are advisory review evidence, not runtime authority."
  },
  "exact_next_authority_if_accepted": "Authorize only exact-hash docs-only materialization/promotion from a fresh clean then-current origin/main worktree, runtime_authorized=false, focused docs/resolver proof, reviewed PR/merge and no deploy. Runtime implementation still requires a separate exact orchestrator authority that includes disposable local fixture authority and, before remote-readiness claim, explicit non-production Supabase provider-contact authority."
}
```

## Acceptance and review receipt

- Clean authority base: `origin/main@5ff6c1b56eac1fa095f63e11d8b6109a330ff701`.
- The delegated orchestrator accepted the exact 29,083-byte artifact at SHA-256
  `9fd547f0ba5442e52c9910dd42f11715ec959990fe045afee88c7c25d1b85cac` for
  docs-only promotion.
- The orchestrator's acceptance-time AI OS observation was
  `a8df55bf306649c04bf4f71abe54122c8fda4d411c61443399c999b1d08f3371`;
  the promotion child refreshed observation
  `687c28018a390151514a056befc0a9ddb9a4d77cb18674b769c691880abe6f51`.
  Both reported Interdomestik authority current, no active runtime slice, Brain
  current and runtime not authorized. Advisory diagnostics grant no authority.
- Internal Sol XHigh architecture and security reviews passed the exact hash and byte
  count. Opus 4.8's post-remediation review was PASS/CONDITIONAL_PASS only because
  inline transport could not independently recompute the hash; the two exact-file
  internal reviews close that transport limitation.
- Gemini's predecessor review was conditional; all corrections were incorporated
  before the accepted artifact was hashed. Sonnet produced no output within its
  configured bound, and Fable was skipped because callable access was unconfirmed.
  Those routes remain NON-PASS and are not represented as approval.
- Required two-pass Brain retrieval was current and active-execution-bound but missed
  the exact tracker target; clean repository program/tracker authority and the exact
  accepted artifact govern. Obsidian remains advisory.
- `humanUseful` remains `unknown_not_confirmed`.

## Promotion contract

- The sole active governed slice becomes `IDA-UI03a2-P0a0b`.
- `IDA-UI03a2-P0a0a` remains completed. `IDA-UI03a2-P0` stays blocked and frozen
  behind completion of P0a0b and the separately governed P0a2 fixture dependency.
- P0a0b is limited to one internal preflight module, one live integration test, one
  test-support fixture module and deterministic size metadata only if required by the
  unchanged generator. The ceiling is two production/config paths, two test/support
  paths, one engineering day and one backend outcome; every new source/test file is
  capped at 150 lines.
- Runtime remains unauthorized until this promotion merges, canonical-main and
  dedicated-worktree resolvers select only P0a0b, AI OS is freshly observed and a
  separate exact orchestrator runtime-authority receipt is recorded.
- Future local live proof requires a fresh standalone PostgreSQL 16 disposable
  container and the exact fixture-only bootstrap authority in the accepted payload.
  No local database, retained container or default database is contacted by this
  promotion.
- Future remote readiness requires a separate provider-contact receipt for an
  explicitly authorized disposable non-production Supabase project. This gate grants
  no remote or production provider contact.
- P0a1, P0a2 implementation, frozen P0, the frozen parent UI03a2 and every protected
  exclusion in the payload remain unpromoted. Automatic CD must be cancelled before
  deploy; no environment, rollout, deployment or alias change is authorized.

## Exact future implementation map

After separate exact runtime authority only:

1. `packages/database/src/admin-connection-preflight.ts`
2. `packages/database/test/admin-connection-preflight.test.ts`
3. `packages/database/test/admin-connection-preflight.support.ts`
4. `scripts/repo-size-budget.json` only when produced by the unchanged deterministic
   generator.

The implementation must keep `packages/database/src/admin-connection-config.ts`,
`packages/database/src/migrate.ts`, `packages/database/src/db.ts`,
`packages/database/src/index.ts`, package scripts, workflows, compose, migrations,
proxy, auth, tenancy and every accepted exclusion unchanged.
