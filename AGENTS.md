# AGENTS.md — Interdomestik

Rules for every agent; `CLAUDE.md`, `code_review.md`, guides and skills point here. In `docs/engineering/`: `RULES.md` (reasons; binding only where a rule here names it), `DIRECTION.md`, `REUSE-CATALOG.md` and `RULES-MAPPING.md`, whose `UNREVIEWED` old rules stay in force.

E = enforced by the named check (`*`: not live yet; follow it); E~ = in part. A = advisory: no machine checks it.

## 1. Work, roles, review

- R-29 Work comes only from the ordered packages of `DIRECTION.md` or the owner's explicit request; ledgers are history. No standing approval unless stated here. No refactor of routing, auth, tenancy, domain boundaries, schema or billing that neither asked for. A.
- R-01 Claude Code implements and owns integration. Codex reviews independently (`gpt-6.2-sol`, `xhigh`); the lead (definition, routing, merging: `RULES.md`, R-01) may give it a bounded part with disjoint files in its own worktree, which Claude then reviews. No model approves its own work. A change merges only with the other model's verdict on the exact head (skips: R-02) and no open finding; the record names head, model served and tier. The owner releases. E: CHK-01*.
- A review is read-only: findings first, by severity, with file and line: `blocker`, `hardening` (fix, or defer with a reason, before merge), `optional`, `rejected` (with evidence). A doubt or a blocked reviewer is no approval: for T1–T3 the lead names another; HIGH work waits or goes to the owner. No paid API as fallback.
- R-02 Astra (high effort or above; bar, skips: `RULES.md`, R-02) only for: the first full review of HIGH work (T4–T6); the final review of its exact head; a concrete unresolved security, gate, concurrency, data-loss or architecture ambiguity. E~: CHK-01*.
- R-03 Rules live only here and in the passages they name. No active instruction file may require or auto-trigger a retired program, runner or command, state another routing than R-01, or repeat a fact the repository holds. E: CHK-02*, HOOK-05*.

## 2. Before you start

- R-19 New module, new table or changed public API: update that package's `MODULE.md` first. E~: CHK-19*.
- R-20 Before writing a helper, type, validator or query, search `REUSE-CATALOG.md` and the package exports. No second action result type or context, format helper, role predicate, page-size clamp or response type; parse a response body, never cast it. E~: CHK-20*.
- R-21 List in the PR the paths the change may edit; give a reason for anything outside. A: CHK-21* reports.
- R-22 One bounded unit per session: implement, verify, record, stop. A.
- R-28 One bounded protected PR per change holds its scope, acceptance, implementation and tests and is its record: no program, tracker or ledger edits, no bookkeeping-only PR. A.
- R-31 Never revert, delete, stash or clean up work you did not create; report it. A.

## 3. Definition of Done (R-04)

Name the tier from the whole diff (deletions, renames). Several tiers: the highest; unsure: the higher. Outside T1–T3, or removing or weakening a test: at least T4. A change of auth, tenancy, routing, billing, consent or legal meaning, privacy, lifecycle or mutation semantics is T5 whatever its path.

- T1 docs: only `docs/**` or other `*.md`; no instruction or architecture document.
- T2 copy: only `apps/web/src/messages/**`. Needs each changed key in every locale.
- T3 client: client files in `apps/web/src/components/**` without new server, database or auth dependency; additive unit tests; E2E specs that only add assertions. Needs R-23 for a new screen; a component test per new interaction.
- T4 server, data: everything else. Needs the rules of §4, with R-06 per tenant query; a denied case per entry point; a conflict case per read-then-write; the API record (`RULES.md`, R-04) for every API contract change.
- T5 auth, tenant, billing: `packages/shared-auth`, `apps/web/src/lib/auth`, `proxy.ts`, tenant authority, any row policy, payments, document access, public entries. Needs T4; a denied matrix (wrong user, tenant, role; injected identity); R-07's sequence test; owner approval for guard admissions.
- T6 delivery, instructions: `.github`, `scripts`, `tools`, instruction files, `README.md`, guides, skills, architecture documents. Needs R-10, R-03; owner approval for required checks, rulesets, `README.md`, instruction and architecture files.

Done = required checks green + Sonar: no new issue + the R-01 review on the final head, confirming the tier + local verification + the tier's line. Say which state a change is in (prepared, tested, merged, deployed, validated by a user) and never report as passed what failed or did not run. E~: CHK-03*.

Local verification: T4–T6 run, on the macOS machine (marker, pre-check rule, narrowing, Mac use, instruction-only: `RULES.md`, R-04), configuration recorded, `pnpm pr:verify` and `pnpm security:guard` once, last, on the final head, after green hosted checks and the review's yes. T1–T4 skip it only if all required checks and the unit, static, audit, RLS, PR E2E and Pilot Gate jobs ran green on that head and current base, identities recorded, nothing flaky, retried or skipped unapproved, no coverage gap; else T4: it runs.

## 4. Server code and data

- R-05 Build every server action and writing route handler on the wrapper (`apps/web/src/lib/safe-action.ts`) with a declared authorization basis (role guard, self-scoped, public intake) and a strict input schema. Never spread request data into a write; set identity and tenant columns from server context, last. An entry reachable without a session stands on the public-entry registry with the setting that closes it. Until WP-02, the interim form (`RULES.md`, R-05) binds. E: CHK-04*, -05*, -26*.
- R-06 Prove a tenant, role or row-policy rule on a real database under the restricted role; a mocked database does not count. E: RLS suite, CHK-06*.
- R-07 Acknowledge an inbound event only after its effect: unexpected failures retryable; receipts reclaimable; idempotency by the sender's event id; ordering by applied events only; failed receipts listable and re-drivable; a sequence test per handler (early, failed, delayed, duplicate). E: CHK-07*.
- R-08 A server `catch` rethrows, returns a typed failure, or records the failure with the error object; never success or an empty result after an error, nor after a dependency's degraded, timed-out or unknown answer. A skipped effect records its reason. E~: CHK-08*.
- R-09 Dates, numbers and money only through the shared helpers (`REUSE-CATALOG.md`); user-facing text only from the catalogues; server messages use the recipient's stored locale. E: `i18n:check`, CHK-09*.
- R-11 A scheduled job declares its schedule in the repository (or is registered dormant) and records each failed item with its error. It sends only through a delivery record: one item per unique key, claimed under a lease, finished as sent or skipped, or requeued with its error and failed after bounded attempts. E~: CHK-11*.
- R-12 Schema changes: a journaled SQL migration with a later timestamp; no push command against a shared database; expand → deploy → contract when the previous build could not run on it; staging and production migrate only in the release pipeline. E: `db:migrations:check-journal`, CHK-12*, HOOK-04*.
- R-13 A script that changes data or schema runs only against a loopback database or the CI container: client from the guarded import (`local` or `confirmed-ci`); remote targets refused. E: CHK-13*.
- R-14 Every test file runs in a lane. A test must be able to fail for the right reason; never keep one that pins a defect, never weaken one to pass a gate or a count; test provider payloads as recorded, through the route's parser. E~: CHK-14*.

## 5. Boundaries

- R-37 Boundary stop. A change that touches or can alter an auth, session, database, tenancy, storage or billing boundary (trust, role or tenant scope, visibility, security behaviour, the task's acceptance there), or any sign of a failure at one, inside or outside the task: stop and report to the owner with file and line. Go on only after the independent security reviewer (Astra, R-02) has reviewed it and approved going on, before the code goes further, and the owner has explicitly authorized it. The PR holds the record: approval, authorization, the exception with its security rationale, tests, evidence, migration notes, rollback plan. Record and signs are lists of `RULES.md`, R-37, and bind as written. Never weaken or bypass a check there. A.
- R-34 `apps/web/src/proxy.ts` is the one entry for page requests. Never route around it (no `middleware`, second redirect layer or matcher change) and change it only with owner approval. It is not the tenant boundary and does not see `/api`: handlers and actions authorize themselves. Never rename or bypass `/member`, `/agent`, `/staff`, `/admin`; keep the `page-ready` markers. E~: the E2E gate, CHK-25*.
- R-15 Layers: screens → actions and handlers → domain packages → `packages/database`. No upward import; no database import in a screen; packages only through their `exports`. E: `check:architecture-boundaries`, CHK-15*.
- R-16 One owning package per table; other code calls its exported command, or its query for rows with a visibility rule. A business rule (role, precondition, visibility, notification) lives there, never in an entry point. E~: CHK-16*.
- R-17 A tenant is an operating entity; a case belongs to the entity that holds the mandate. Tenant context comes only from the session through `withTenantAuthority`; no hand-built or literal tenant id; nothing is assigned to an entity by default. Writes that must hold together share one tenant transaction; inside one, never open another; a write that depends on a read locks that row or, changing that same row, repeats its state as the condition and treats zero changed rows as a conflict; on ambiguous authorization, refuse. Insurers and bureaus get no access; a partner gets approved, recorded, revocable access to one case. E: tenant guards, CHK-17*.
- R-18 Payments only through the provider-neutral port; a provider's SDK, events and payloads stay in its adapter. Membership payments are never mixed with compensation, commission or a lawyer's share. E: CHK-18*.
- R-30 Identity and sessions: Better Auth only, through `@interdomestik/shared-auth`; provider clients and types stay in adapters; Supabase PostgreSQL is persistence only. Never bypass authentication, even in development. Each environment trusts only its own exact host names. E~: CHK-15*.
- R-35 Never weaken a tenant, row-level-security (RLS), document, privacy or data-integrity protection: all are mandatory. Documents: upload against a signed intent to a private bucket, server-built tenant path, no overwrite; read only through the access-checked route; shared only by share pack; access logged; removed only by the retention rule. Consent is stored with version and time. Invariants are database constraints; audit and ledger rows are corrected by new rows. E~: `pnpm-audit`.
- R-23 A new screen follows R-05, R-09, R-15, R-17 and R-34, and: ties loading, empty, error, retry and pending states to the real completion signal (A); transmits each consent it shows (CHK-22*); meets WCAG 2.2 AA with keyboard, focus and responsive behaviour (A11Y reports; else A).

## 6. Gates, environment, secrets

- R-10 A gate becomes required only with a negative-input test (missing, empty, unparseable, valid-but-empty), a trial on the last 20 merged PRs without a false refusal, and the defect class it catches. Routine schema, locale and dependency changes pass without an admission PR. `repo:size:check` growth is advisory except the coarse largest-file and class-aware modularity limits: no exact allocation, shared-budget edit or byte-specific approval for routine source, test or catalogue work. Today's required checks stay until the owner approves a change. E: CHK-10*.
- R-24 No `supabase`, `vercel` or deploy command in a development session; no checkout linked to a shared project. No agent tool reaches production, writes to staging or force-pushes. E~: HOOK-01*, HOOK-02*.
- R-25 Never print, log, commit or serialize a secret, nor copy a credential into a file or variable. Never work around a sandbox, hook or approval refusal; report it. `.env*` files stay development-only and untracked; local services bind to loopback. E~: `gitleaks`.
- R-26 No real personal data, scans or office files in the repository, logs or any AI tool; member spreadsheets enter only by the upload screen. E~: CHK-23*.
- R-27 Holds: `better-auth` ~1.6 with `accountId` equal to the e-mail; never `postcss-selector-parser` 6.1.3; `turbo` 2.10.7. E: pins; `pnpm-audit`.
- R-33 Search with `rg` and `fd`; never `rg -r`; ANE: `RULES.md`, R-33. E: HOOK-03*.
- R-36 `pnpm` only; never hand-edit generated output. E~: pin, ignore rules.
