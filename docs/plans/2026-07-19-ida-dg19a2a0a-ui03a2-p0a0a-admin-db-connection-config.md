---
title: IDA-DG19-A2a0a — Administrative DB connection configuration contract
date: 2026-07-19
status: accepted
authority: canonical_design_only
runtime_authorized: false
promoted_slice: IDA-UI03a2-P0a0a
accepted_payload_sha256: 2419d382d99c5742be5a8810a518f5ab928be99e857c06ce9fb0735f7f47fbfb
accepted_payload_bytes: 25466
base_sha: 46878f2b9920a6dc54635f8f9ff404f0c031acf0
risk_tier: 3
human_useful: unknown_not_confirmed
---

# IDA-DG19-A2a0a — Administrative DB connection configuration contract

This docs-only gate records the delegated orchestrator's exact acceptance of the
configuration-only prerequisite and promotes only `IDA-UI03a2-P0a0a`. It blocks the
previously selected `IDA-UI03a2-P0` without resuming or changing its frozen runtime
state. No source, test, database, migration, provider, deployment or production alias
work is authorized.

The JSON between the fences is the exact accepted UTF-8 payload. Hash the bytes after
the opening fence's LF through and including the payload's terminal LF immediately
before the closing fence; exclude only the fence bytes. The payload is exactly 25,466
bytes and its SHA-256 is recorded in frontmatter.

```text
{
  "schema_version": "interdomestik_design_gate_v1",
  "gate": {
    "gate_id": "IDA-DG19-A2a0a",
    "slice_id": "IDA-UI03a2-P0a0a",
    "human_title": "Kontrata e konfigurimit të lidhjes administrative DB",
    "english_title": "Administrative DB connection configuration contract",
    "candidate_count": 1,
    "sole_candidate": "pure_explicit_admin_connection_config",
    "classification": "promotion/design-gate",
    "future_runtime_risk_tier": 3,
    "status": "design_only_pending_exact_review_and_orchestrator_acceptance",
    "runtime_authorized": false,
    "human_useful": "unknown_not_confirmed",
    "one_outcome": "Purely parse and validate explicit administrative connection inputs and return a deterministic, redaction-safe configuration object with every Postgres.js 3.4.9 fallback-bearing option fixed. The slice performs no I/O and creates no database client.",
    "primary_user": "The future IDA-UI03a2-P0a0b reserved-session preflight implementation.",
    "entry_point": "Internal resolveAdminConnectionConfig(env, nowEpochMs) function imported by relative path only; no package export, command, workflow, or current caller is added.",
    "exit_states": [
      "accepted: an immutable AdminConnectionConfig owns private credential/trust fields and can return a fresh exact Postgres.js options object to a later internal caller",
      "rejected: a typed stable error code and non-secret field category are returned without constructing a client, opening a socket, or logging input"
    ]
  },
  "authority_receipt": {
    "repository_commit": "46878f2b9920a6dc54635f8f9ff404f0c031acf0",
    "origin_main_commit": "46878f2b9920a6dc54635f8f9ff404f0c031acf0",
    "repo_authority_method": "All source, tracker, package, and caller evidence comes from immutable origin/main commit objects. Dirty checkout contents, generated Brain results, and the canonical staged snapshot are not source authority.",
    "ai_os_observation_sha256": "b44c2a73d4b48ec10ead0a6220e88636feaec9a72bc5879ef6b043a51f8f7198",
    "ai_os_generated_at": "2026-07-19T10:22:09.450Z",
    "ai_os_state": "Interdomestik authority=current; activeSlice=none; runtime=not_authorized; Brain=current; integrity and adapter diagnostics advisory only.",
    "brain_receipt": "Two current/no-log advisory queries used the registered migration-runner-prerequisite-design execution for thread 019f6586-34cc-7311-900c-9989770f4d29. They returned only generic AGENTS guidance; no advisory result overrides repo authority.",
    "clean_origin_resolver": "The immutable origin/main authority still selects frozen IDA-UI03a2-P0; P0a0a is not promoted.",
    "superseded_non_pass_artifacts": [
      "5d2b8d837072e39b5036376ef1b15fed942a5fd6dd473426b33720075716eab7",
      "691f97f8017a72f29a03cd35be0576e458e8969538c9036f48926c6224a7ab37",
      "fed9f3b298bef92d4ad523f916f33d8d5414f3ae06a952ec160daf9a93d25296",
      "a45074042bb354407abbbd51091753cd208e8279a99db88690fb96be0c17f45a"
    ]
  },
  "contamination_and_location": {
    "canonical_checkout": "Quarantined on codex/ida-ui03a2-p0a-promotion at 46878f2b with four staged obsolete promotion paths. Its resolver result and staged content are excluded and remain untouched.",
    "cd11_checkout": "Detached at 46878f2b with only task-local .codex/config.toml MCP wiring modified. It is not clean; the overlay is excluded from product and gate scope and remains untouched.",
    "design_evidence_location": "/tmp/evidence only",
    "future_materialization": "After exact orchestrator acceptance only, use a fresh clean worktree and branch from then-current origin/main. Never copy, recover, commit, reset, or amend either contaminated checkout."
  },
  "current_repo_evidence": {
    "locked_driver": "packages/database/package.json on origin/main declares postgres ^3.4.9 and pnpm authority locks 3.4.9 for this design.",
    "current_shared_pool": "packages/database/src/db.ts constructs shared cached admin/RLS clients from URL strings and environment-derived options. P0a0a imports none of it and creates no pool.",
    "current_migration_runner": "packages/database/src/migrate.ts imports db, logs process/path metadata, and invokes Drizzle migrate. It remains unchanged and is not a caller of P0a0a.",
    "driver_fallbacks": "Postgres.js 3.4.9 parseOptions fills host, port, user, password, database, application_name, SSL and every defaults-table option from URL query values, PG* variables, OS username, or internal defaults when omitted.",
    "remote_endpoint_authority": "Current Supabase documentation identifies db.<project-ref>.supabase.co:5432 as the direct endpoint suitable for migrations and requires the project's downloaded CA certificate for verify-full authentication.",
    "mcp_limitation": "interdomestik_qa is named by repo policy but is not callable in this tool context; immutable git-object reads are the read-only fallback."
  },
  "binding_contract": {
    "purity_boundary": {
      "allowed": "Synchronous string/URL parsing, strict Base64 decoding, node:crypto X509Certificate metadata validation, object construction/freezing, stable result formation, and built-in node:tls.checkServerIdentity function reference.",
      "forbidden": "postgres() invocation, net/tls socket creation, DNS, fetch, filesystem reads, subprocesses, timers, SQL, Drizzle, migration imports or folder reads, database/provider calls, logging, telemetry, mutation of process.env, and durable state.",
      "determinism": "All behavior depends only on the supplied read-only env record and explicit nowEpochMs. Tests never depend on ambient PG*, Node trust stores, network, provider state, or wall-clock time."
    },
    "input_contract": {
      "credential_input": "env.DATABASE_URL is the sole credential source.",
      "remote_trust_input": "env.DATABASE_ADMIN_CA_PEM_BASE64 is mandatory only for nonloopback endpoints. It is non-secret trust material, capped at 64 KiB decoded, and never included in diagnostics.",
      "local_authority_input": "Numeric loopback is accepted only when env.NODE_ENV is exactly test and env.ADMIN_DB_LOCAL_SCRATCH is exactly 1. No missing, development, CI, or production value implies authority.",
      "ignored_inputs": "DATABASE_URL_RLS, DB_RLS_ROLE, E2E_DATABASE_URL*, all PG* variables, USER/USERNAME/LOGNAME, NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, NODE_TLS_REJECT_UNAUTHORIZED, and every unrelated environment value are never read.",
      "required_url_shape": [
        "protocol exactly postgres: or postgresql:",
        "single raw authority with exactly one unescaped at-sign and no comma",
        "nonempty percent-decoded username and password",
        "one explicit ASCII hostname and explicit decimal port",
        "one nonempty single-segment percent-decoded database name"
      ],
      "rejected_url_shape": [
        "query string or fragment of any kind, including sslmode, sslrootcert, options, role, search_path, target_session_attrs, application_name, connect_timeout, or unknown names",
        "multi-host, Unix socket/path host, missing port, defaulted credential/database component, raw whitespace/control/NUL, decoded structural delimiter, malformed percent encoding, duplicate at-sign, hostname percent encoding, trailing dot, uppercase/lookalike remote host, or path with a second segment",
        "password callback, object, alternate URL variable, or any non-string input"
      ],
      "parse_order": "Apply bounded raw-string checks before WHATWG URL parsing, then validate decoded components and exact reclassification. Never pass the original URL string to Postgres.js and never retain it after producing the private configuration."
    },
    "endpoint_and_tls_policy": {
      "loopback": "Only numeric 127.0.0.1 or [::1], explicit port, NODE_ENV=test, ADMIN_DB_LOCAL_SCRATCH=1, and database prefix interdomestik_admin_config_ classify local_scratch. Its ssl option is exactly false and its summary states unauthenticated_loopback_test_only.",
      "remote_direct": "Only lower-case db.<20 lowercase alphanumeric project-ref>.supabase.co on port 5432 classifies supabase_direct. Every pooler hostname, port 6543, private/custom DNS name, IP literal, localhost, trailing dot, and provider lookalike is rejected.",
      "remote_ca_validation": "Require strict canonical Base64, exactly one PEM CERTIFICATE block with whitespace only outside the block, decoded size 1..65536 bytes, successful X509Certificate parsing, ca=true, and nowEpochMs within validFrom..validTo. Missing or invalid CA fails before configuration creation.",
      "remote_ssl_object": "Exactly { ca: decodedPem, rejectUnauthorized: true, servername: admittedHostname, checkServerIdentity: node:tls.checkServerIdentity }. Explicit ca excludes Node's default and NODE_EXTRA_CA_CERTS trust lists. No ssl string, boolean true, custom verifier, system CA fallback, sslmode, sslrootcert, TLS-disable switch, or caller override is represented.",
      "policy_limit": "P0a0a validates configuration shape only. It does not prove that a CA belongs to a specific project, that TLS succeeds, that DNS resolves directly, or that a database role has any posture. Those require separately authorized live proof."
    },
    "exact_postgres_js_3_4_9_options": {
      "construction_rule": "AdminConnectionConfig.toPostgresOptions() returns a new object; later code must call postgres(options), never postgres(url). The class keeps credentials and CA in private fields, is not enumerable, and supplies redacted toJSON and node:util.inspect.custom output.",
      "url_derived_fields": {
        "host": "single admitted hostname string",
        "port": "single explicit integer",
        "database": "decoded database name",
        "username": "decoded username",
        "password": "decoded password"
      },
      "fixed_fields": {
        "path": null,
        "sslnegotiation": null,
        "max": 1,
        "idle_timeout": 0,
        "connect_timeout": 5,
        "max_lifetime": null,
        "max_pipeline": 1,
        "backoff": false,
        "keep_alive": 30,
        "prepare": false,
        "debug": false,
        "fetch_types": false,
        "publications": "none",
        "target_session_attrs": "primary",
        "types": {},
        "transform": {"undefined": null},
        "connection": {"application_name": "interdomestik_admin_config_v1"},
        "onnotice": "stable no-op function",
        "onparameter": "stable no-op function"
      },
      "ssl_field": "false for explicitly authorized numeric local_scratch; the exact explicit TLS object for supabase_direct.",
      "unsupported_or_omitted_features": "No url/query sslmode, sslrootcert, sslcert, sslkey, host list, socket/path, pass callback, no_prepare, deprecated timeout, transform hook, custom type, debug callback, notice callback, parameter callback, custom socket, subscription/publication behavior, or caller-supplied option bag is accepted.",
      "immutability": "Freeze nested public summaries and every returned options container. Return a fresh credential-bearing options object per call; no module-global cache exists. The internal class cannot be serialized into secrets through JSON.stringify or util.inspect.",
      "driver_fit_note": "sslnegotiation and max_pipeline exist in locked 3.4.9 runtime source although its public declaration is incomplete; the implementation uses a narrow local extension of postgres.Options rather than any or a broad cast. path is supplied as undefined at the actual TypeScript boundary; JSON null here denotes an explicitly disabled/no-path contract, not a value passed to the driver. transform.undefined is supplied as undefined at the TypeScript boundary; JSON null here records that exact absent transform behavior."
    },
    "diagnostics": {
      "success_summary": [
        "contract_version: admin_connection_config_v1",
        "endpoint_class: local_scratch | supabase_direct",
        "transport_policy: unauthenticated_loopback_test_only | explicit_ca_hostname_verified",
        "connection_count: 1",
        "target_session: primary"
      ],
      "stable_error_codes": [
        "ADMIN_DB_CONFIG_MISSING",
        "ADMIN_DB_CONFIG_URL_INVALID",
        "ADMIN_DB_CONFIG_ENDPOINT_REJECTED",
        "ADMIN_DB_CONFIG_LOCAL_AUTHORITY_REQUIRED",
        "ADMIN_DB_CONFIG_CA_REQUIRED",
        "ADMIN_DB_CONFIG_CA_INVALID"
      ],
      "error_field_categories": "url | endpoint | local_authority | ca only; never a supplied value, length, hostname, port, username, database, project ref, certificate subject/fingerprint, parser message, raw cause, stack, or nested object.",
      "logging": "The module never logs. It returns a discriminated result. Tests place unique sentinels in every credential, host/database, CA, ignored env, URL parser error, and nested exception and require absence from JSON.stringify, util.inspect, error message/name/cause, stdout, and stderr."
    }
  },
  "exact_file_map": {
    "production_and_config_paths": [
      {
        "path": "packages/database/src/admin-connection-config.ts",
        "change": "new_internal_module",
        "responsibility": "Types, strict URL/endpoint/CA parsing, exact locked-driver option construction, private redaction-safe config class, and stable error result.",
        "line_ceiling": 150
      },
      {
        "path": "scripts/repo-size-budget.json",
        "change": "conditional_deterministic_only",
        "responsibility": "Update only if the unchanged canonical size generator requires inventory metadata for the accepted implementation. No manual semantic budget increase."
      }
    ],
    "test_and_support_paths": [
      {
        "path": "packages/database/test/admin-connection-config.test.ts",
        "change": "new_table_driven_unit_test",
        "responsibility": "Pure no-I/O tests for URL matrix, endpoint/local authority, explicit CA metadata, exact options, hostile environment immunity, immutability, and redaction.",
        "line_ceiling": 200,
        "exception": "One table-driven test file may use the repository's governed <=200 test ceiling; helpers and fixtures remain local and no integration lane is added."
      }
    ],
    "explicitly_unchanged": [
      "packages/database/src/index.ts",
      "packages/database/package.json",
      "packages/database/src/db.ts",
      "packages/database/src/migrate.ts",
      "packages/database/src/seed.ts",
      "packages/database/apply-migration.ts",
      "packages/database/drizzle/**",
      "package.json",
      ".github/workflows/**",
      "docker-compose.yml",
      "scripts/docker-env-bootstrap.sh",
      "packages/database/test/rls-test-connection.ts",
      "apps/web/src/proxy.ts"
    ]
  },
  "ceilings": {
    "production_and_config_paths": 2,
    "test_and_support_paths": 1,
    "engineering_days": 0.75,
    "backend_outcomes": 1,
    "new_dependencies": 0,
    "target_compliance": "PASS",
    "stop_rule": "A third production/config path, second test/support path, source export/caller/package/workflow change, live connection, socket, SQL, integration fixture, more than 0.75 day, or second outcome stops and returns to the orchestrator."
  },
  "acceptance_cases": [
    {"id":"P0a0a-01","case":"Pure boundary","proof":"A source/static test forbids postgres(), net/tls connect, DNS, fetch, fs, child_process, timers, SQL/Drizzle/migration imports, logging, and process.env mutation; the connector is never constructible from this module."},
    {"id":"P0a0a-02","case":"Explicit credential shape","proof":"Valid protocol, one raw authority, decoded user/password, explicit host/port, and one database segment pass; every missing/defaulted/multi-host/socket/query/fragment/control/delimiter ambiguity fails."},
    {"id":"P0a0a-03","case":"No startup injection","proof":"sslmode and every query or fragment, including unknown names, reject before options creation. No query parameter reaches connection startup state."},
    {"id":"P0a0a-04","case":"Endpoint classifier","proof":"Only exact numeric loopback under the explicit test-only authority or exact db.<20-char-ref>.supabase.co:5432 classify. Localhost, private names/IPs, all poolers, 6543, trailing-dot, uppercase/lookalike, and arbitrary providers fail."},
    {"id":"P0a0a-05","case":"Loopback fail closed","proof":"Numeric loopback requires NODE_ENV=test, ADMIN_DB_LOCAL_SCRATCH=1, explicit port, and interdomestik_admin_config_ database prefix. Missing/mistyped/development/CI/production authority rejects."},
    {"id":"P0a0a-06","case":"Explicit CA policy","proof":"Remote direct requires one canonical Base64 PEM CA within size/time bounds. Missing, malformed, multiple, trailing-data, non-CA, expired, not-yet-valid, or oversized material fails. Loopback ignores and does not retain CA input."},
    {"id":"P0a0a-07","case":"Exact TLS object","proof":"Remote options contain only explicit CA, rejectUnauthorized=true, exact servername, and built-in checkServerIdentity; local options contain ssl=false. Node trust-store and TLS-disable variables cannot alter either."},
    {"id":"P0a0a-08","case":"No Postgres.js fallback","proof":"For every 3.4.9 fallback-bearing field, the returned object matches the exact URL-derived/fixed value while all PG*/OS/default sentinels vary adversarially."},
    {"id":"P0a0a-09","case":"Locked option semantics","proof":"sslnegotiation=null, types={}, backoff=false, max=1, max_pipeline=1, timeouts/lifetime/keepalive, prepare/debug/fetch_types/publications/target_session_attrs, application_name and no-op hooks match the binding contract exactly; unsupported inputs have no representation."},
    {"id":"P0a0a-10","case":"Secret-safe object","proof":"JSON.stringify and util.inspect of success/config/error expose only the public summary; toPostgresOptions returns a fresh frozen object and is the sole explicit secret-bearing escape for the future internal caller."},
    {"id":"P0a0a-11","case":"Sanitized rejection","proof":"Unique sentinels across all inputs and parser/X509 failures never appear in result codes/categories, serialized or inspected objects, captured stdout, or stderr."},
    {"id":"P0a0a-12","case":"No caller or runtime claim","proof":"Diff adds no export, caller, command, workflow, connection, fixture, migration behavior, provider action, or live proof; P0a0b must separately consume and test the contract."}
  ],
  "test_plan_after_separate_runtime_authority": {
    "focused_test": "pnpm --filter @interdomestik/database exec tsx --test test/admin-connection-config.test.ts",
    "focused_static_guards": [
      "pnpm check:modularity-guard",
      "pnpm check:db-access",
      "node scripts/repo-size-budget-sync.mjs --check"
    ],
    "final_phase_c_gates_before_pr_readiness": [
      "pnpm pr:verify",
      "pnpm security:guard",
      "pnpm e2e:gate"
    ],
    "proof_limit": "Unit evidence proves only deterministic parsing, classification, option construction and redaction. It proves no network reachability, TLS handshake, CA-to-project binding, role identity, database ownership, session affinity, SQL safety, migration correctness, Docker/CI role topology, or deployment readiness."
  },
  "abuse_controls": [
    "PG*, OS username and driver defaults cannot fill any omitted credential or option.",
    "URL query/startup parameters cannot inject SSL mode, role, search_path, target-session behavior, application name, timeouts, or arbitrary startup parameters.",
    "Remote configuration cannot select poolers, transaction mode, private endpoints, alternate providers, system trust, a custom verifier, or TLS disablement.",
    "Loopback authority is explicit, default-off, test-only, numeric, and database-prefix bound; no NODE_ENV absence or generic CI flag enables it.",
    "Credential-bearing state is private and non-enumerable; only the deliberately named future-caller method releases a fresh options object.",
    "All failures collapse to stable codes/categories and never recursively serialize driver, URL, X509, or environment errors.",
    "The module has no side-effect capability and cannot connect, query, mutate, log, or contact a provider."
  ],
  "rollback": {
    "before_merge": "Delete only the future isolated P0a0a branch/worktree after preserving review receipts; do not touch contaminated or frozen state.",
    "after_merge": "Revert the one internal module, one unit test, and conditional deterministic size metadata. No export or caller exists, so removal restores byte-for-byte prior runtime behavior.",
    "database_and_provider": "No SQL, connection, certificate download, provider call, secret mutation, role/grant/object/journal/row, socket, or durable state exists to roll back."
  },
  "excluded_follow_up_dependencies": {
    "IDA-UI03a2-P0a0b": "Not active. Owns Postgres.js client construction, live TLS, CA-to-endpoint evidence, bounded cancellation/teardown, reserved-session identity/posture/state proof, scratch/fixture authority, and integration tests.",
    "IDA-UI03a2-P0a1": "Not active. Owns same-session safe migration execution, advisory migration lock, trusted search_path, DDL/ownership posture, legacy entry closure, runner caller wiring and rollback.",
    "IDA-UI03a2-P0a2": "Not active. Owns Docker/CI distinct runtime-role fixture, privilege/ownership/default-ACL/membership manifest, PostgreSQL 15/16 compatibility, seed/runtime phase propagation, workflow wiring and executable least-privilege proof.",
    "frozen_P0_and_parent": "IDA-UI03a2-P0 and parent UI03a2 remain frozen/blocked/unmerged and cannot consume P0a0a as runtime evidence."
  },
  "protected_exclusions": [
    "No socket, DNS, TLS handshake, Postgres.js client, DB connection, SQL, reserved session, DDL, Drizzle migration, migration folder/journal, scratch DB or integration lane.",
    "No runtime role, Docker/CI topology, privilege manifest, seed/reset, runtime/RLS fixture, workflow, package script, export, caller, provider, certificate download, secret store, staging, production or deployment mutation.",
    "No proxy.ts, routes, auth/session/OTP, tenancy, UI, billing, storage/documents/uploads/compression, German, dashboards/redesign or unrelated IDA slice.",
    "No contact with PR #1380, frozen UI03a2/P0 worktrees, retained container/database, default DB, canonical staged snapshot, or provider/deployment surfaces."
  ],
  "primary_source_evidence": [
    {"observed_on":"2026-07-19","source":"https://raw.githubusercontent.com/porsager/postgres/v3.4.9/src/index.js","fact":"Locked parseOptions shows URL/PG*/OS fallback order, exact defaults, query-to-startup propagation, sslmode transformation, types handling, backoff and max_lifetime defaults."},
    {"observed_on":"2026-07-19","source":"https://raw.githubusercontent.com/porsager/postgres/v3.4.9/src/connection.js","fact":"Locked connection code uses sslnegotiation, ssl object assignment, max_pipeline, backoff, keep_alive, target_session_attrs and connection startup parameters as represented by the contract."},
    {"observed_on":"2026-07-19","source":"https://raw.githubusercontent.com/porsager/postgres/v3.4.9/types/index.d.ts","fact":"Locked public declarations define the supported option types; a narrow local extension is necessary only for runtime-supported sslnegotiation and max_pipeline fields missing from the declaration."},
    {"observed_on":"2026-07-19","source":"https://nodejs.org/api/tls.html","fact":"An explicit ca replaces the default trusted CA list and checkServerIdentity performs hostname verification; NODE_EXTRA_CA_CERTS does not extend trust when ca is explicitly supplied."},
    {"observed_on":"2026-07-19","source":"https://supabase.com/docs/guides/database/connecting-to-postgres","fact":"Supabase documents db.<project-ref>.supabase.co:5432 as the direct endpoint suitable for migrations and distinguishes it from session/transaction poolers."},
    {"observed_on":"2026-07-19","source":"https://supabase.com/docs/guides/platform/ssl-enforcement","fact":"Supabase recommends verify-full and directs users to obtain the database CA certificate from Database Settings. P0a0a validates supplied trust material but performs no provider access or live verification."}
  ],
  "review_requirements": {
    "hash_binding": "Every reviewer independently recomputes and quotes exact SHA-256 and UTF-8 byte count for this artifact.",
    "architecture": "Judge exact 1-code-plus-conditional-metadata/1-test/0.75-day credibility, locked-driver type/runtime fit, internal consumability, purity, modularity, rollback and clean separation from P0a0b/P0a1/P0a2.",
    "tier_3_security": "Judge raw URL ambiguity, PG*/startup injection, endpoint spoofing, loopback fail-closed authority, explicit CA/TLS object, Node trust-store immunity, secret object/redaction behavior, option completeness, unsupported-option closure and no-I/O enforcement.",
    "route_policy": "Use bounded strongest reachable exact-hash routes. BLOCKED_PERMISSION, timeout, no output, unavailable Fable, wrong hash, or artifact rewrite is non-PASS and is recorded rather than awaited indefinitely."
  },
  "exact_next_authority_if_accepted": "Authorize only exact-hash gate materialization and docs-only promotion from a fresh clean origin/main worktree with runtime_authorized:false, focused docs/resolver/review proof, PR/merge/no-deploy health, and canonical resolver selecting only IDA-UI03a2-P0a0a. Source/test implementation still requires a later separate exact runtime authority."
}
```

## Acceptance and review receipt

- Clean authority base: `origin/main@46878f2b9920a6dc54635f8f9ff404f0c031acf0`.
- Accepted orchestrator AI OS observation:
  `95f52f67b1c027cc5662429c822e71f7d85c3a79e3e988b7dd6b054160825d98`;
  Interdomestik authority and Brain were current, `activeSlice=none`, and runtime was
  `not_authorized`. Advisory diagnostics grant no authority.
- Independent architecture review: PASS on exact SHA and byte count.
- Independent Tier-3 security review: PASS on exact SHA and byte count.
- Sonnet 4.6: the original route was `BLOCKED_NO_OUTPUT` after 45,469 ms. The promotion
  rerun used the repository wrapper with the complete packet inline and ended
  `reviewer_no_output_timeout` at the configured first-output bound.
- Gemini 3.1 Pro: the original route was `BLOCKED_PATH_POLICY` on an isolated evidence
  path. The promotion rerun supplied the complete packet inline, but the repository
  wrapper ended `missing_cli` in this child environment even though
  `pnpm review:preflight` passed. Fable 5 remained skipped/unverified. None is
  represented as a PASS; the accepted internal exact-hash reviewers are the strongest
  clean fallback for this narrow gate.
- `humanUseful` remains `unknown_not_confirmed`.

## Promotion contract

- The sole active governed slice becomes `IDA-UI03a2-P0a0a`.
- `IDA-UI03a2-P0` is blocked and frozen behind P0a0a; it is not resumed here.
- P0a0a is limited to one internal configuration module, one table-driven unit test and
  deterministic size metadata only if the unchanged generator requires it.
- P0a0a performs no I/O: no Postgres.js client, socket, DNS, TLS handshake, filesystem,
  subprocess, SQL, DDL, migration, reserved session or scratch database.
- Runtime remains held until this promotion merges, canonical-main and dedicated-worktree
  resolvers select only P0a0a, AI OS is freshly observed and a separate exact runtime
  authority is recorded.
- P0a0b, P0a1, P0a2, frozen P0, the frozen parent UI03a2 and every protected exclusion in
  the payload remain unpromoted.
- Automatic CD must be cancelled before deploy. No deployment or alias change is
  authorized.

## Exact future implementation map

After separate runtime authority only:

1. `packages/database/src/admin-connection-config.ts`
2. `packages/database/test/admin-connection-config.test.ts`
3. `scripts/repo-size-budget.json` only when produced by the unchanged deterministic
   generator.

The ceiling remains at most two production/config paths, one test/support path, 0.75
engineering day and one backend configuration-proof outcome.
