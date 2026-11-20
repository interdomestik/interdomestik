# Database baseline for the new production

> **Adopted from the review of 2026-11-13 (run A).** This document was written as a proposal for the owner and is kept as it was approved: where it says "draft", "proposed" or "would", read that as of the review. Documents named without a directory stand beside this one in `docs/engineering/`. Paths that begin with `A/`, `inputs/` or `shared/` cite the review record, which is kept outside this repository; they are evidence, not files to open here. Code paths and line numbers are those of commit `ef1bd0ef5`; a line number into another of these documents is that of the review, and a rule id, a work-package number or a part number is the stable reference.

| | |
|---|---|
| **Status** | Draft for the owner's decision; run A, round R2, part R2b (2026-11-16). It is a baseline for the **new** database project of the first production. It proposes no repair of staging or of today's production, which is not carried forward. Nothing here was applied anywhere. **Corrected in R3 (2026-11-17)** after the independent review of R2b (`A/review/R2b-response.md`, comments C04, C05, C06, C14) and with the owner's answers 19 and 26: DB-06, DB-10, DB-26, DB-27, DB-28, DB-32, the queries Q3 and Q5, part 11.1 (new), and the level of SEC-12. **Updated in the closing pass (2026-11-17)** with two decisions of the owner (`inputs/CLOSING-owner-input.md`): the recovery objectives of DB-26 are approved as proposed, and staging is a brand-new project with this same baseline |
| **Answers** | Owner input of R2b, §6a (`inputs/R2b-owner-input.md:26-101`) |
| **Evidence** | The repository at `ef1bd0ef5c608d856615154921f9386f615d11de`. The lead's three read-only catalog exports (`inputs/db-config-staging-prod-2026-11-16.md`, `…-16b.md`, `inputs/db-catalog-prod-staging-2026-11-15.md`): lead evidence, not verifiable from this run; every value cited from them was extracted by script (`A/raw/R2b/db/export_values.py`, `export-values.json`). Three incident notes among the memory copies: dated claims of earlier sessions, checked against the code. **This run sent no query and no request to any database or service** |
| **Who produced what** | Facts from code and migrations: one helper unit on Opus 5.5 (`A/raw/R2b/db/db-code-facts.md`). Two measurements, every recommended value and every "blocks the pilot" decision: the main session on Fable 5.2, which re-read the lines behind each blocking control (`A/PROGRESS.md`, R2b). Four findings came with it (part 12): one was traced by a helper on Opus 5.5 and then passed two skeptic passes on Fable 5.2; three have an adversarial and a practical pass on Opus 5.5 |
| **Reads with** | `DIRECTION.md`, part 8 (line 12 points here), WP-04 and WP-15; `RULES.md`, R-06, R-12, R-13, R-24 |

Columns of the tables: **Staging** and **Today's production** are the lead's exports of 2026-11-15 and 2026-11-16. **New production** is the recommended value. **Verified by** names the query of part 11 (Q1 to Q9), a test or a check. **Blocks** says whether the pilot may open without it. `NOT VISIBLE` means that no SQL query shows the setting: it is an owner check of part 10.

**Staging is new as well** (the owner's decision of 2026-11-17, closing pass). The new setup has a brand-new staging project with the same baseline as the new production: every control of this document is set on the staging project at its creation as on the production project, and is verified there by the same queries and owner checks. The columns **Staging** and **Today's production** describe the two old projects; both are test environments and are deleted later, by the owner. The code is kept, and retired parts are removed package by package.

## 1. The answer in short

1. **The application needs the database provider for two things only: PostgreSQL and file storage.** At the pinned commit there is no call to the provider's authentication, no call to its Data API, no remote procedure call and no realtime channel in non-test source (`MEASURED`, part 2). Everything else that the provider switches on by default is unused surface.
2. **That unused surface is open on both existing projects.** The two API roles hold SELECT, INSERT, UPDATE and DELETE on 60 of 109 public tables on staging and on all 85 on today's production, and the Data API server is connected on both. The repository grants none of this: it is the provider's default. What stands between an anonymous caller with the public key and the tables is that no row policy passes for a caller who has not set the tenant setting. That holds for every policy the repository creates (63 statements read). It is one barrier, and it must hold for every future table and policy. **The new production revokes the privileges and switches the Data API off** (DB-01, DB-02). This is the item you flagged as possibly the most important; it is settled as a blocking control of the first setup, not as a breach found. The finding behind it (SEC-12) is S3 since R3: neither pass found anything a caller could use, and the priority of a control is not the severity of a finding (review comment R2b-C04).
3. **Two pilot requests cannot complete on the hosting platform, and nothing bounds a request's database work** (DATA-13, S1). There each connection pool of an instance holds one connection. The membership page of a member who is covered by a company agreement, and a staff decision "needs info" or "rejected" on a payment, each open a second transaction while they hold the first and wait for themselves until the platform ends the request. The runtime role has no statement, lock or idle-in-transaction limit; the server default is 120 seconds for a statement and no limit for the other two. A memory note reports such a hang on staging, with the database idle and the cause left open. **Required before the opening: the two paths fixed, the test lane on one connection, three role settings, and a rehearsal with concurrent sessions** (part 12; DB-12 to DB-14, DB-19).
4. **A database built from the repository is not the database the schema declares.** Four migration files are outside the journal and are never applied by the migrator. A database built today keeps a default tenant, `tenant_mk`, on the tenant column of 31 tables, and lacks four declared indexes, among them the one that prevents a duplicate commission. Storage objects come from a second set of SQL files that no workflow applies. Every CI database is built this way. **The first production is built by one scripted path, and a check compares the result with an expected model: the declared schema plus a registry of the objects that SQL manages on purpose** (DB-27, DB-28; finding DATA-14; corrected in R3, review comment R2b-C05).
5. **The connection is encrypted and the server is not authenticated.** The driver is configured in a mode that accepts any certificate. **The new production verifies the server certificate before members' data is imported** (DB-21; finding SEC-13).
6. **Several settings cannot be seen from SQL** and are owner checks with their place in the provider's dashboard: the pooler's mode and size, SSL enforcement, network restrictions, point-in-time recovery and retention, the compute size, the Data API setting, the sign-up setting of the provider's authentication (part 10).

## 2. Identity is Better Auth only: what still depends on the provider's authentication, API roles or Data API

`MEASURED` by the main session on non-test source under `apps/web/src` and `packages/*/src`: 0 calls of `.auth.*`, 0 of `.rpc(`, 0 realtime channels; every `.from(` on a provider client is `.storage.from(`.

| # | Dependency | Where | Reached at run time | New production | Why |
|---|---|---|---|---|---|
| 1 | The service-role client | `packages/database/src/server.ts:40-51`; one importer, `apps/web/src/lib/storage/service-role.ts:3` (six storage calls, `:94-158`) | Yes: every server-side storage call | **Keep.** It is the storage path. Its key is a production secret of the new project | Storage is the one provider service in use besides PostgreSQL |
| 2 | The browser client with the public key | `packages/database/src/client.ts:7-12`; one importer, `apps/web/src/features/claims/components/SharedEvidenceUploadDialog.tsx:3,80-86` | Yes: one upload to a signed URL. No user session of the provider is involved | **Keep for phase 1**; later replace by an upload through a server route, and drop the key | The signed token authorises the upload; the key only passes the provider's gateway |
| 3 | The cookie-bound server client | `packages/database/src/server.ts:9-34`, exported at `packages/database/src/index.ts:6` | No caller (`MEASURED`) | **Remove** the function and its export | Dead code that would create a provider session if it were ever called |
| 4 | Table privileges of `anon` and `authenticated` in `public` | Not in the repository: 4 `GRANT` or `REVOKE` statements in all migrations, none on a public table for these roles (`supabase/migrations/00009_storage_tenant_prefix_backstop.sql:43,70-71`; `packages/database/drizzle/0065_crm_task_persistence.sql:142`). They are the provider's default privileges | Through the Data API, by anyone who holds the public key | **Remove:** revoke on every table, sequence and function in `public`, revoke usage on the schema, and change the default privileges so that later objects are not granted either | The application connects as `interdomestik_runtime_rls`; nothing uses the API roles |
| 5 | The Data API itself | The provider runs it for every project; on both existing projects its server is connected to the database | By anyone on the internet | **Switch off**, or expose no schema | No call site |
| 6 | Row policies that name the API roles | Six policies "No public access" for `anon, authenticated`, `USING (false)` (`packages/database/drizzle/0036_supabase_advisor_security_hardening.sql:14-99`) | — | **Keep as the migrations create them**; they grant nothing | The other 57 policy statements name no role, or the role `public`, and therefore apply to every role, the API roles included; each compares with the tenant setting |
| 7 | Storage policies for a provider session | `supabase/migrations/00002`, `00006`, `00007`: policies by `auth.uid()` and `auth.role()`; `00009:83-159`: six policies `TO authenticated` | Never: no caller is `authenticated` | **Do not create them.** Storage is reached by the service role and by signed URLs only | Dead under Better Auth; a policy that nobody can meet is a second design to maintain |
| 8 | `private.current_tenant_id()` (security definer, executable by `authenticated`) | `supabase/migrations/00009:43-71`; called only by the six policies of row 7 | Never | **Do not create it** | It exists for row 7 |
| 9 | `handle_new_user`, `is_admin` (security definer, executable by `anon`) | On staging only. `is_admin` is in no file of the repository; `handle_new_user` only in `supabase/migrations/archive/` | — | **Absent**, since the new project is built from the repository | Staging drift |
| 10 | The provider's authentication service | Every project has it. Locally it is configured with sign-up and one social provider on (`supabase/config.toml:28-54`) | No call site | **Sign-up off, no provider, no anonymous sign-in** | Nobody should be able to obtain an `authenticated` token |
| 11 | Environment names | `.env.example:1-6`: the project URL, the public key, the service-role key, two bucket names | — | **Keep** all five while rows 1 and 2 stand | — |

**Order of the transition, and how each step is verified.** No step breaks a path that is in use, because nothing in use depends on what is removed.
1. In the repository, before the project exists: remove row 3; move the storage SQL that the new project needs (the two buckets with their limits) into the one build path of DB-27, without the policies of rows 7 and 8. *Verified by:* the type check and the storage tests.
2. When the project is created, before any data: Data API off (row 5); sign-up off (row 10); SSL enforced (DB-21). *Verified by:* the three settings in the dashboard, and by a request with the public key to the project's REST address that is refused.
3. The build path applies the migrations, then one journaled migration revokes the privileges of the three API roles in `public` and changes the default privileges (row 4; it is written so that it also runs where the roles do not exist, as `0036` is). *Verified by:* Q1 and Q2.
4. Phase 0, on staging built the same way: upload and download of claim evidence and of a policy document work with rows 4, 5, 7 and 8 removed. *Verified by:* the journeys of WP-17.
5. After the opening: Q1, Q2 and Q7 are part of the check that runs after every release.

`NOT VERIFIED`: that file storage keeps working with the Data API off. The two are separate services of the provider, and the application's storage calls do not pass through the Data API; step 4 is the proof.

## 3. Roles and privileges

| # | Control | Staging | Today's production | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|---|
| DB-01 | The Data API | Its server is connected (`PostgREST 14.5` as `authenticator`). Exposed schemas `NOT VISIBLE` | Connected. `NOT VISIBLE` | Off, or no exposed schema | Part 2, row 5 | The dashboard setting; a refused request with the public key | **Yes** |
| DB-02 | Privileges of `anon` and `authenticated` in `public` | SELECT, INSERT, UPDATE, DELETE on 60 of 109 tables; usage on the schema | The same on 85 of 85 tables | None; no usage on the schema; default privileges changed | Part 2, row 4. With the privileges in place, one wrong policy or one table without row-level security is readable and writable by anyone | Q1 | **Yes** |
| DB-03 | Privileges of `service_role` in `public` | All four on 109 of 109 | 85 of 85 | None on tables. The role is used for storage only | The role bypasses row-level security. With the Data API on, a leaked service key reads and writes every table | Q1 | No, if DB-01 holds; do it in the same migration |
| DB-04 | Sign-up in the provider's authentication | `NOT VISIBLE` | `NOT VISIBLE` | Off; no provider | Part 2, row 10 | The dashboard; `auth.users` is empty at the opening and stays empty (Q9) | No, if DB-01 and DB-02 hold; set it anyway |
| DB-05 | Security-definer functions outside the provider's schemas | `public.handle_new_user`, `public.is_admin`: executable by `anon`, `authenticated` and the runtime role | `private.current_tenant_id`: executable by `authenticated` | None | Part 2, rows 8 and 9 | Q2 | No |
| DB-06 | The runtime role | `interdomestik_runtime_rls`: login, not superuser, no BYPASSRLS, no settings | The same | The same attributes, with the three limits of part 5. It owns no table, view, function or schema, and it is a member of no other role: an owner is not bound by a table's policies unless FORCE is set, whatever its attributes say (review comment R2b-C06). Only data privileges on `public`, and SELECT on the migration ledger for the start-up attestation (`packages/database/src/runtime-authority-observation.ts:42-44`). A password of its own | TEN-01. The code refuses to start in production without a separate URL for this role (`packages/database/src/db.ts:62-75`) | Q3a, Q3b and Q3c: the attributes, that it owns nothing, and that it belongs to no role; the attestation at start, extended to the same three (`DIRECTION.md`, part 8, line 3) | **Yes** |
| DB-07 | The application's privileged connection | The role is `NOT VISIBLE` (the address is a secret). `postgres` can log in and has BYPASSRLS | The same | `NOT VERIFIED` which role it uses today. Recommended: a login role of its own for this pool, with its own limits, not `postgres` | The identity library reads and writes through this pool (`apps/web/src/lib/auth/schema.ts:6`), and the sign-in tables are closed to every role without BYPASSRLS (`0036:6-99`), so every request uses it. A limit set on a role is the only one that survives transaction pooling, and `postgres` is shared with the dashboard and with tools: a session setting left by a tool on that login once made every write fail on staging (memory note of 2026-11-11; the application code holds no such statement, DB-18) | Q3 | No; decided in WP-15 |
| DB-08 | Test roles | None | `interdomestik_rls_test` exists and can log in | None | `DIRECTION.md`, part 8, lines 3 and 6 | Q3 | **Yes** |

## 4. Row-level security

| # | Control | Staging | Today's production | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|---|
| DB-09 | Row-level security on every table of `public`, and at least one policy on each | 109 of 109; no table without a policy | 85 of 85; none | Every table | The CI test covers only tables with a tenant column (`packages/database/test/rls-coverage.test.ts:37-55`). A table without that column and without row-level security would be open to every role that holds a privilege | Q4; the CI test widened to every table of `public` | **Yes** |
| DB-10 | No policy passes for a caller who has not set the tenant setting | 190 policies on 109 tables. 12 of the tables, with 24 of the policies, are not declared by the repository's schema: tables of another product (`eco_*`, `tregu_listime`, `artikuj`, `organizations`, `users` and others; `A/raw/R2b/db/server-vs-schema-tables.json`) | 105 policies on 85 tables | Only the policies of the journal. Each compares with `current_setting('app.…', true)`, which is null when unset, or is `false` | `MEASURED` by the main session: 63 `CREATE POLICY` statements in `packages/database/drizzle/`, 28 shapes, none with `true`, none with `auth.uid()` | Three proofs together (part 11.1): Q5 as an inventory of expressions; the policies of the built database equal to the reviewed list of the expected model (DB-28); the denied-operation tests under the runtime role with the tenant setting absent and wrong. Q5 alone proves nothing | **Yes** |
| DB-11 | FORCE row-level security | On the nine sponsor tables (`0099_acq3b_sponsor_seats.sql:259-269`) | On none (0099 is not applied) | As the migrations create it. **It changes nothing for the two roles the application uses**: the runtime role owns no table, so policies bind it without FORCE; `postgres` has BYPASSRLS, which FORCE does not bind | Uniform FORCE becomes necessary only if DB-07 moves the privileged pool to a role that owns tables and has no BYPASSRLS | Q4 lists it | No |
| DB-12a | Views | One, `tenant_entity_boundaries`, with `security_invoker=true` | The same | Every view in `public` has `security_invoker` | A view without it reads with its owner's rights and bypasses the policies | Q6 | No; the check is in the list |

What the database cannot enforce: every query on the privileged pool bypasses the policies. Which code may use that pool is policed in the repository by the required tenant guard, not in the database (`A/R1-evidence.md`, A8).

## 5. Timeouts

| # | Setting | Staging and today's production | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|
| DB-12 | `statement_timeout` | Server: 120 s. Runtime role: none. `anon` 3 s, `authenticated` 8 s, `authenticator` 8 s (the provider's defaults) | Runtime role: **15 s** as a starting value. Batch work (the import, a scheduled job) raises it with `SET LOCAL` inside its own transaction | The provider bounds its own API roles and leaves the application's role unbounded. Neither the connection options nor the tenant transaction set a limit (`packages/database/src/db.ts:43-57`; `tenant.ts:23-47`), and no migration holds an `ALTER ROLE` | Q3 shows the setting. A test in phase 0: a 20-second statement through the runtime address is cancelled | **Yes: a limit exists.** The number is `NOT VERIFIED`: it is settled in phase 0 from the statement times that `pg_stat_statements` records (installed on both projects) |
| DB-13 | `lock_timeout` | 0 | Runtime role: **5 s**. The migration step: 10 s, as the migration kernel of the repository already sets and nothing runs (`packages/database/src/migration-execution-kernel.ts:60-63`; `packages/database/package.json:35` runs the plain migrator) | A request that waits for a lock holds its connection; a migration that waits for a lock blocks every request behind it | Q3; the log of the migration step | **Yes**, with DB-12 |
| DB-14 | `idle_in_transaction_session_timeout` | 0 | Runtime role, and the role of DB-07: **15 s** | This is the setting that ends the hang of part 6: a transaction that holds a connection while its request waits for something else is idle in transaction | Q3 | **Yes**, with DB-12 |
| DB-15 | `idle_session_timeout` | 0 | 0 for the pooled roles | The pooler closes idle server connections | — | No |
| DB-16 | The longest time a function of the hosting platform may run | Not set in the repository (`apps/web/vercel.json`; no `maxDuration` in the source). The memory note reports 300 s | Explicit per kind of route: short for pages and actions, longer for the import and for scheduled jobs | A hang then surfaces in seconds, in the log, with the route's name | The deployed configuration; the rehearsal | No |

## 6. Connections and pooling

| # | Control | Today | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|
| DB-17 | The pooler mode per path | `NOT VISIBLE`: the port is in the secret address. The code switches prepared statements off only when the port is 6543 or one variable is set (`packages/database/src/db.ts:44-46`; `pooler-mode.ts:1-11`) | Both run-time addresses on the **transaction** pooler, port 6543. The migration step and tools on a direct connection or the session pooler | Memory note of 2026-11-11: on the session pooler, frozen functions kept their connections and filled a pool of 15. The repository cannot choose the port; a deployment does | The start-up attestation reports the class of the port; the owner check of part 10 | **Yes** |
| DB-18 | Session state over a transaction pooler | Every setter in non-test source is `SET LOCAL` or `set_config(…, true)` inside a transaction; `set_config(…, false)` occurs 0 times | The same, kept by a static check; an operator never runs a bare `SET` through port 6543 | Memory note of 2026-11-11: a bare `SET` left a pooled connection read-only | The static check (0 today) | No |
| DB-19 | Connections per instance | Two pools per process, privileged and runtime; on the hosting platform in production each is clamped to **one** connection (`db.ts:40-41,77-86`). Off the platform: 5 in production, 10 elsewhere, so no test and no CI run sees the clamp | **Decided by a trace and a rehearsal, not by a default** (see below) | Finding DATA-13 | A rehearsal in phase 0 with concurrent sessions on the pilot journeys: no function reaches its time limit | **Yes: the rehearsal passes** |
| DB-20 | Server connections | `max_connections` 60, 3 reserved. Pooler size and client limit `NOT VISIBLE` | Chosen with the compute size so that the instances of DB-19 fit | — | Part 10 | No |
| DB-21 | Transport security | Server: `ssl` on. Enforcement `NOT VISIBLE`. Client: `ssl: 'require'` in production (`db.ts:48`), which the driver maps to "do not verify the certificate" (installed `postgres` 3.4.9, `src/connection.js:283-284`) | SSL enforced on the project. The client verifies the server with the provider's certificate authority | Finding SEC-13. A certificate digest exists only in a preflight that nothing runs (`packages/database/src/admin-connection-preflight.ts:30-38`) | A start-up check that the connection was verified; a test that a wrong authority is refused | **Yes**, before the import of members (part 12) |
| DB-22 | Network restrictions | `NOT VISIBLE` | Restricted to the hosting platform's addresses if the plan gives fixed ones; otherwise not applicable | — | Part 10 | No |

**DB-19 in detail.** With one connection per pool, three shapes of code wait for ever: a tenant transaction that opens a second tenant transaction; a tenant transaction that queries the privileged pool while another request holds it; and the reverse. The adversarial pass traced the pilot paths for them (part 12): **the first shape exists in two places, the second in two, the third in none**, so the second cannot lock anything by itself. The control: the two places of the first shape are fixed; the tenant and role tests run on one connection, so that a new case fails in CI; the limits of part 5 turn a remaining case into an error after seconds; the rehearsal proves the result under concurrency. Whether the pools should then hold more than one connection on the transaction pooler is `NOT VERIFIED` until the rehearsal.

## 7. Storage

| # | Control | Staging | Today's production | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|---|
| DB-23 | Buckets and limits | `claim-evidence`: private, 52,428,800 bytes, 19 types. `policies`: private, 15,000,000 bytes, 4 types | The same | The same, created by the build path | The repository and both exports agree. The 19 types are exactly the application's evidence formats (`packages/domain-claims/src/claims/evidence-file-policy.ts:49-80`); the application's own cap is 10 MB, 50 MB for video (`:113-124`) | Q7 | No |
| DB-24 | Storage policies | 4, all for `policies`, in an older form; none for `claim-evidence` | 8: six `TO authenticated`, two for the service role | None. Access by the service role and by signed URLs only | Part 2, rows 7 and 8. Staging and today's production differ from each other and from the repository | Q7; upload and download in phase 0 | **Yes: proven in phase 0** |

Two small mismatches go to the technical-debt register: the policy upload accepts `image/jpg` and any file with a known extension (`apps/web/src/app/api/policies/analyze/_core.ts:52-71`), which the bucket then refuses.

## 8. Indexes against the pilot's queries

Static only; no plan was run. `NOT MEASURED`: any query time.

| Fact | Staging | Today's production |
|---|---|---|
| Foreign keys without a leading index | 140 | 124 |
| Tables whose tenant column leads no index | 5: `free_start_drafts`, `leads`, `membership_family_members`, `push_subscriptions`, `user_notification_preferences` | 4 (the first is not created there) |
| The largest tables (estimated rows) | `session` 709, `audit_log` 681, `user` 87, `claim` 41 | `session` 882, `claim` 127, `user` 88 |

**DB-25. No index blocks the pilot.** The pilot brings about 1,400 members; at that size a scan of these tables is short. Three indexes are worth adding with the pilot screens, because every claim view reads them and only the tenant column leads an index today: `claim_messages` by claim, `claim_stage_history` by claim and time, `notifications` by user (`packages/database/drizzle/0008_add_multitenant.sql:105-106,118` are their only indexes in the journal). The staff queue sorts by the time of the last update and no index leads that column. Decide the rest in phase 0 from `pg_stat_statements`, not from the list of 140. Two indexes that the schema declares are missing from a database built today (DB-27).

## 9. Backups, the build, and the identity of the database

| # | Control | Today | New production | Reason and evidence | Verified by | Blocks |
|---|---|---|---|---|---|---|
| DB-26 | Backups and recovery | `NOT VISIBLE`: the plan, point-in-time recovery, retention | Point-in-time recovery on before the first import (the owner decided on 2026-11-17 that the new production runs on a plan that has it); one restore drill into an isolated project; the objectives below the table, which the owner approved on 2026-11-17 (question 33) | The import is the first data that cannot be re-created. `DIRECTION.md`, part 8, line 4 | The drill record with the measured recovery point and time | **Yes** (already a gate) |
| DB-27 | One path that builds the database | Three sets of SQL: the journal (100 entries); four files outside it; `supabase/migrations/` for storage, applied by no workflow; and a fourth directory, `packages/database/migrations/` (7 files), referenced by nothing. The release workflow has no migration step. Applied ledger entries by the lead's export: 100 on staging (newest 2026-11-08) and 91 on today's production (newest 2026-06-24) (`inputs/db-catalog-prod-staging-2026-11-15.md:20,47`); the journal holds 100 | One scripted, rehearsed path in the release pipeline: extensions; the journal; the storage buckets; the revocation of part 2. The four files outside the journal are resolved by journaled migrations: the tenant defaults dropped, the declared indexes created. The unused directory is deleted | Finding DATA-14; DATA-03 and DATA-02. `MEASURED` (`A/raw/R2b/db/declared_not_created.py`): `0008_add_multitenant.sql:36-98` sets `DEFAULT 'tenant_mk'` on the tenant column of 32 tables; a journaled migration drops it for one (`0014_webhook_events_tenant_nullable.sql:5`); only the unjournaled `0015_drop_tenant_defaults.sql` drops the other 31; the schema declares no default. Four declared indexes are created by no journaled migration: `agent_commissions_tenant_subscription_type_uq`, `idx_claims_user_created`, `idx_policies_user_tenant_created`, `branches_tenant_code_uq` | Q9; the comparison of DB-28 | **Yes** |
| DB-28 | Drift detection | A check that the files and the journal agree, with the four files on an allow-list (`scripts/check-drizzle-migration-journal.mjs:24-30`); the row-level-security coverage test. Nothing compares a database with the declared schema | In CI: build a database from the journal and compare it with an **expected model**: the newest schema snapshot for what the schema declares (columns, defaults, declared indexes and constraints), plus one reviewed registry file for what SQL manages on purpose (33 indexes, 11 triggers, 12 functions, one exclusion constraint, and the policies that only SQL creates; R-12). Zero **unexplained** differences: a difference fails unless the registry names the object and the migration that creates it, and a registry object that the built database lacks fails too. After every release: Q9 on the live database | It is the check that would have shown DATA-14. A plain "zero differences" against the snapshot could never pass: `0008_add_multitenant.sql:105` creates the index `idx_claim_messages_tenant_id` and `0099_acq3b_sponsor_seats.sql:271-272` the exclusion constraint `sponsor_terms_no_overlap`, and the snapshot declares neither (`meta/0099_snapshot.json:4438`; review comment R2b-C05; all three re-read by the main session in R3). CI already builds such a database three times per PR | The CI step, with four adoption cases: the 31 tenant defaults and the 4 missing declared indexes of DATA-14 fail as unexplained; `idx_claim_messages_tenant_id` passes as registered; a build without `sponsor_terms_no_overlap` fails; a new index that neither the schema nor the registry names fails | **Yes**, the CI step: it is the proof of DB-27 |
| DB-29 | The PostgreSQL version | Servers: 17.6. CI: `postgres:16`, pinned (`.github/workflows/ci.yml:161`). Local: 15 and 16 (`docker-compose.yml:3,125,264`). The unused admin preflight accepts 15 and 16 only (`admin-connection-preflight.ts:70-71`) | CI on the major version of the new project before the first release | Tests run on another major version than the one that will hold the data (MAIN-12 recorded the local difference) | Q8; the CI image | No; before the pilot |
| DB-30 | Extensions | Staging: `uuid-ossp`, `btree_gist`, `pgcrypto`, `pg_stat_statements` and three of the provider. Today's production: no `btree_gist` | `uuid-ossp` and `btree_gist` (`supabase/migrations/00000_extensions.sql:2`; `packages/database/drizzle/0099_acq3b_sponsor_seats.sql:270`). No `pg_cron`: scheduled work is driven over HTTP (R-11) | — | Q8 | No |
| DB-31 | Which database is this? | The seed guard knows production by one constant (`packages/database/src/seed-target-guard.ts:10`). A memory note of 2026-11-06 says that an environment secret of staging held a production address: `NOT VERIFIED`, an owner check | The new project's reference is on the guard's list before the project holds data. Every stored database address is checked against the environment it is stored for. The application prints a non-secret identity at start | DATA-04 as corrected; `DIRECTION.md`, part 8, line 6 | The start-up attestation; the owner check of part 10 | **Yes** (already a gate) |
| DB-32 | The tenants a new database starts with | In the repository: `0008_add_multitenant.sql:30-33` inserts two active tenants, `tenant_mk` and `tenant_ks`. On staging and on today's production the active tenants are `NOT VERIFIED`: no export lists them; Q9 settles it | Only the pilot entity is active at the opening | MAIN-21: the default public tenant in code is Kosovo, and password sign-up on the neutral door accepts any known tenant | Q9 | **Yes** |

**The recovery objectives of DB-26, approved by the owner on 2026-11-17 in the closing pass, as proposed** (question 33, `inputs/CLOSING-owner-input.md`; proposed on the owner's answer 19). They replace the candidates of 24 hours and 4 hours.

| Objective | Approved | Why this number | Shown by |
|---|---|---|---|
| Recovery point, the database | **15 minutes** | With point-in-time recovery the loss is the write-ahead log not yet shipped; the provider's own figure is `UNVERIFIED` in this run. Fifteen minutes is a bound that the drill can show, and what it loses can be keyed again from the day's receipts and bank lines, which the criterion "100% of payments reconciled" needs anyway | The restore drill: restore to a chosen minute and compare with the payments recorded up to it |
| Recovery point, stored documents | **24 hours**, until the drill shows better | Point-in-time recovery covers the database, not the files in storage. Whether the provider's backup covers storage objects, and at what grain, is `NOT VERIFIED` | The drill restores a document and its row together |
| Recovery time | **4 hours** inside staff hours (Monday to Friday, 08:00 to 16:00, Skopje); by 10:00 of the next working day for an incident outside them | The pilot answers requests by the end of the next working day; a recovery inside the same working day keeps that criterion reachable. No one is on call in the pilot | The measured time of the drill, from the decision to restore to the first signed-in request |

## 10. Owner checks: what no query shows

The places are named as the provider's dashboard named them to this session's knowledge; `NOT VERIFIED` against the live dashboard, which this run cannot open. By the owner's direction of 2026-11-17 these settings are set correctly when the new project is created; the values on staging and on today's production are not needed and are no longer asked for (answer 26).

| Check | Where | Wanted for the new project |
|---|---|---|
| Is the Data API on, and which schemas does it expose? | Project Settings → Data API (earlier: API) → "Enable Data API", "Exposed schemas" | Off, or no schema |
| Can new users sign up in the provider's authentication? Which providers are on? | Authentication → Sign In / Providers → "Allow new users to sign up"; the provider list; "Allow anonymous sign-ins" | All off |
| The pooler: pool size, client limit; which port each stored address uses | Project Settings → Database → Connection pooling; the "Connect" dialog shows the transaction pooler (6543), the session pooler (5432) and the direct connection | Run-time addresses on 6543; the sizes recorded |
| SSL enforcement | Project Settings → Database → SSL Configuration → "Enforce SSL on incoming connections" | On; the authority certificate downloaded there for DB-21 |
| Network restrictions | Project Settings → Database → Network Restrictions | Recorded; restricted if the hosting plan allows |
| Backups: the plan, point-in-time recovery, retention | Database → Backups | Point-in-time recovery on; retention recorded |
| The compute size | Project Settings → Compute and Disk | Recorded with `max_connections` |
| The integration that posts the skipped check `Supabase Preview` on every PR | The provider's GitHub integration settings | Off, unless the provider's branching is used on purpose (`CI-GATE-PROPOSALS.md`, part 2.3) |
| Every stored database address (hosting environments, CI environments): does it belong to the environment it is stored for? | The hosting platform's environment variables; the repository's environment secrets | Each checked once, by host name only; the memory note of DB-31 settled |
| On staging and today's production, for information only: do the four unjournaled files' effects exist? | Q9 | Recorded; not repaired |

## 11. The queries of the first setup

Read-only. They are for the lead or the owner to run on the new project, and again after every release. **This run ran none of them.** They read the system catalogs, because `information_schema` shows only what the caller has privileges on.

```sql
-- Q1  API roles hold nothing in public (expected: 0, 0, false for each role)
select r.rolname,
       count(*) filter (where has_table_privilege(r.oid, c.oid, 'select')) as can_read,
       count(*) filter (where has_table_privilege(r.oid, c.oid, 'insert,update,delete')) as can_write,
       has_schema_privilege(r.oid, 'public', 'usage') as schema_usage
from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
where r.rolname in ('anon','authenticated','service_role') and n.nspname = 'public' and c.relkind in ('r','p','v','m')
group by r.rolname, r.oid;
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl;  -- no grant to the three roles

-- Q2  no security-definer function outside the provider's schemas (expected: no row)
select n.nspname, p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname in ('public','private');

-- Q3a application roles: attributes (expected: interdomestik_runtime_rls only; f f f f t; the three limits in rolconfig)
select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin, rolconfig from pg_roles where rolname like 'interdomestik%';

-- Q3b the runtime role owns nothing, itself or through a role it belongs to (expected: no row).
--     An owner is not bound by a table's policies unless FORCE is set, whatever Q3a shows.
select 'relation' as kind, n.nspname, c.relname as name, c.relowner::regrole as owner, c.relforcerowsecurity as forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast'
  and pg_has_role('interdomestik_runtime_rls', c.relowner, 'MEMBER')
union all
select 'function', n.nspname, p.proname, p.proowner::regrole, null
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private','drizzle') and pg_has_role('interdomestik_runtime_rls', p.proowner, 'MEMBER')
union all
select 'schema', n.nspname, null, n.nspowner::regrole, null
from pg_namespace n
where n.nspname in ('public','private','drizzle','storage','auth') and pg_has_role('interdomestik_runtime_rls', n.nspowner, 'MEMBER');

-- Q3c the runtime role is a member of no role (expected: no row). The second query is information:
--     who may act as the runtime role (by the lead's export today: postgres, with neither INHERIT nor SET).
select m.roleid::regrole as member_of, m.admin_option from pg_auth_members m where m.member = 'interdomestik_runtime_rls'::regrole;
select m.member::regrole as may_act_as_runtime, m.admin_option from pg_auth_members m where m.roleid = 'interdomestik_runtime_rls'::regrole;

-- Q4  every table of public has row-level security and a policy (expected: no row)
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
  and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid));

-- Q5  an INVENTORY of policy expressions, not a proof (part 11.1). It lists every policy whose read side or
--     whose write side does not name the tenant setting. Expected: no row, or only rows on the reviewed list.
--     The read side of a policy is qual (absent = true). Its write side is with_check, or qual where with_check is absent.
select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public'
  and ( ( cmd in ('SELECT','UPDATE','DELETE','ALL')
          and coalesce(qual, 'true') !~ 'current_setting\(''app\.' and coalesce(qual, 'true') <> 'false' )
     or ( cmd in ('INSERT','UPDATE','ALL')
          and coalesce(with_check, qual, 'true') !~ 'current_setting\(''app\.' and coalesce(with_check, qual, 'true') <> 'false' ) );

-- Q6  every view reads with the caller's rights (expected: no row)
select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m') and coalesce(c.reloptions::text, '') not like '%security_invoker=true%';

-- Q7  storage (expected: no policy; two private buckets with the limits of part 7)
select policyname, roles, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';
select id, public, file_size_limit, cardinality(allowed_mime_types) from storage.buckets;

-- Q8  server and extensions
select name, setting, unit from pg_settings
where name in ('server_version','max_connections','ssl','statement_timeout','lock_timeout','idle_in_transaction_session_timeout');
select extname, extversion from pg_extension;

-- Q9  the build equals the repository
select count(*) as applied, max(created_at) as newest from drizzle.__drizzle_migrations;  -- the journal's count and newest entry
select c.relname from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and a.attname = 'tenant_id' and a.atthasdef and not a.attisdropped;  -- expected: no row
select indexname from pg_indexes where schemaname = 'public' and indexname in
  ('agent_commissions_tenant_subscription_type_uq','idx_claims_user_created','idx_policies_user_tenant_created','branches_tenant_code_uq');  -- expected: every declared one
select id, is_active from tenants;          -- expected: the pilot entity alone is active
select count(*) from auth.users;            -- expected: 0, at the opening and later
```

A tenth check has no query: no user row carries the mark "classification pending" at the opening (MAIN-21; the column is named in `packages/database/src/schema/auth.ts`).

### 11.1 What two of these queries cannot prove, each with a failing example (review comment R2b-C06)

**Q3a reads role attributes, not ownership.** Failing example: a role that is not a superuser and has no BYPASSRLS, and that owns `public.claim`, for instance because the migration step ran as that role. Q3a shows `f f f f t` and passes; a `select` on `claim` as that role returns the rows of every tenant, because an owner is not bound by a table's policies unless FORCE is set (FORCE is on nine tables on staging and on none on today's production, DB-11). The application's own start-up check has the same gap: it reads `rolbypassrls` and `rolsuper` and nothing else (`packages/database/src/db.ts:88-114`; `packages/database/src/rls-role-assertion.ts:70-84`, re-read in R3). Q3b and Q3c close it in the first setup; the start-up check is extended to ownership and membership in WP-15.

**Q5 reads expressions, not behaviour.** Failing example: `create policy p on t for all using (true) with check (tenant_id = current_setting('app.current_tenant_id', true))`. The first version of Q5 left this policy out, because its write side names the setting; yet every row of `t` can be read without a tenant. The predicate above lists it now. It still proves nothing by itself: an expression can name the setting and pass without it (`… is null or …`), and the permissive policies of one table are joined by OR, so one loose policy opens what the others close.

**What opens the pilot for DB-06, DB-09 and DB-10 is therefore three things together:**
1. Q3a, Q3b and Q3c without an unexpected row.
2. The policies of the built database equal to the reviewed list. The policy list is part of the expected model of DB-28; a person reviews each entry once, and an added or changed policy fails CI until it is reviewed.
3. **Denied-operation tests under the runtime role**, in CI (CHK-06) and once on the new project before the import, for every table of `public`, inside a transaction that is rolled back. With the tenant setting **absent**: a `select` returns no row, an `update` or a `delete` changes none, an `insert` is refused. With the setting naming **another tenant**: the same, and an `insert` that carries the first tenant's id is refused. The test compares with the row count that the privileged connection sees, so that a table that is empty in the test database is listed as "not proven" and is never counted as passed; the tables the pilot writes get a fixture row for two tenants.

None of the three was run by this review, and the queries of this part were written and read, not executed.

## 12. Findings recorded with this baseline

Four findings, and one earlier record corrected. Records: `A/outbox/findings.json`; passes: `A/raw/R2b/skeptic/SKDB-adversarial.md`, `SKDB-practical.md`, `DATA13-adversarial.md`, `DATA13-practical.md`.

| Finding | Record | Level | In short | Passes | Pilot level of the record | Controls and package |
|---|---|---|---|---|---|---|
| DATA-13 | F-A-144 | **S1** | On the hosting platform each pool holds one connection and nothing bounds a wait for it; two pilot paths open a second tenant transaction inside the first and cannot complete there | the adversarial trace on Opus 5.5 that found the two paths; then two passes on Fable 5.2 on the cited lines | PILOT-BLOCKER for phase 1: fix the two paths (pass the transaction; move the notification behind the commit), run the tenant and role tests on a pool of one connection, set the three role limits, and prove both journeys in the phase 0 rehearsal with one connection per pool | DB-12 to DB-14, DB-19; WP-01 |
| DATA-14 | F-A-145 | **S2** | A database built from the repository is not the database the schema declares: 31 tenant defaults stay, four declared indexes are missing | an adversarial and a practical pass on Opus 5.5, which agree on the level | ACCEPTABLE WITH A NAMED CONTROL, which is a blocking control of the first setup: the first production is built by one scripted path that holds the statements of the files outside the journal, and the built database is compared with the declared schema (DB-BASELINE.md, DB-27 and DB-28), before the import of members. Not a defect that a pilot user meets: with one entity the default tenant is the right one | DB-27, DB-28; WP-04 |
| SEC-12 | F-A-149, which supersedes F-A-146 | **S3** (S2 until R3) | The provider's API roles keep full table privileges and the Data API serves; nothing that a caller could use was found | an adversarial and a practical pass on Opus 5.5. Both found nothing usable: row-level security on all 97 tables that the journal creates, no usable security-definer function or sequence, a view with the caller's rights. The first proposed S3; the second kept S2 on a consequence that needs a future table without row-level security. In R2b the main session followed the second and argued that S2 "fits the blocking controls"; the independent review showed that this takes the priority of a control for the severity of a finding (R2b-C04). What the two existing projects expose through the Data API is `NOT VERIFIED`, and by the owner's direction of 2026-11-17 it is not investigated: both are test environments | ACCEPTABLE WITH A NAMED CONTROL, which is a blocking control of the first setup: the Data API is off or exposes no schema, and its roles hold nothing in `public` (DB-BASELINE.md, DB-01 and DB-02), verified before the import of members; the coverage test reads every table of `public` (DB-09) | DB-01, DB-02, DB-03, DB-09; WP-15 |
| SEC-13 | F-A-147 | **S2** | Database connections are encrypted and do not verify the server certificate | an adversarial and a practical pass on Opus 5.5, which agree on the level | ACCEPTABLE WITH A NAMED CONTROL, which blocks the import of members' data: both database clients verify the server certificate against the provider's certificate authority, with a start-up check and a test that a wrong authority is refused (DB-BASELINE.md, DB-21). It does not block the work of phase 0 on test data | DB-21; WP-15 |

**DATA-13 in detail.** The two paths: the membership page of a member who is covered by a company agreement (`apps/web/src/app/[locale]/(app)/member/membership/_core.ts:57,75-94` → `apps/web/src/lib/entity-disclosure.core.ts:76`), and a staff decision "needs info" or "rejected" on a payment attempt (`apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts:92,164-179` → `apps/web/src/lib/notifications/recipient-role.ts:18`). Each holds the tenant pool's one connection in a transaction and asks the pool for a second transaction; the driver queues the request without a limit (`postgres` 3.4.9, `src/index.js:329-342`), and the first transaction waits for it. A covered member has the `subscriptions` row that the first path needs (`packages/domain-membership-billing/src/sponsors/provisioning-effects.ts:71-91`). The trace covered 554 places where a tenant transaction is opened: 8 candidates, 2 genuine, 6 refuted by an after-commit hook, an optional transaction parameter or a savepoint; the privileged pool is used inside a tenant transaction in 2 places and never the other way round, so those two cannot lock each other. **The hang is traced line by line and not reproduced: this run executes no code.** One local run with one connection per pool settles it.

**The limits of part 5 do not repair it.** With an idle-in-transaction limit and no code change, the server ends the first transaction, the queued inner request then runs, and in the payment path the notification is sent for a decision that was rolled back (the Fable adversarial pass, `DATA13-adversarial.md`, section 3). The order is therefore: fix the two paths (WP-01), make the test lane use one connection so that the shape fails in CI (CHK-06), then set the limits.

**DB-21 (the certificate check).** It blocks the import of members' data, and not the work of phase 0 on test data. After the adversarial pass alone the decision was "not blocking", left open for the practical pass. That pass names the verified certificate as the control that makes the pilot acceptable, and the main session follows it: the change is one connection option and one start-up check; nothing else authenticates the server (the only certificate digest is in a preflight that nothing runs and that refuses the servers' version); and from the import on, everything the pilot stores about some 1,400 people crosses that path. No party on the network path is shown, so the level stays S2 (SEC-13). If the provider's pooler cannot be verified this way, that is the owner's decision as a recorded exception, not a silent default.

**DATA-12 corrected** (F-A-148, S3 unchanged). R1 called the four migration files outside the journal dead material and recommended deleting them. They are not dead; the record now covers only the twelve files that are (seven legacy files with their runner, five archived files).

**What the lead's exports show and this document does not record as findings:** the state of staging and of today's production (twelve tables of another product on staging, two security-definer functions executable by anyone there, storage policies in three different states, a test role on today's production). They are not carried to the new project, and this run was asked for a baseline, not for repairs.

## 13. What blocks the pilot, in one list

| Control | In short | Package |
|---|---|---|
| — | The two requests that open a second transaction inside the first are fixed, and the tenant and role tests run on one connection (DATA-13) | WP-01 |
| DB-01, DB-02 | The Data API is off and the API roles hold nothing in `public` | WP-15 |
| DB-06, DB-08 | The application runs as a role without BYPASSRLS that owns nothing and belongs to no other role; no test role exists | WP-15 (already a gate) |
| DB-09, DB-10 | Every table has row-level security and a policy; no policy passes without the tenant setting — shown by the denied-operation tests and the reviewed policy list, not by Q5 alone (part 11.1) | WP-15; CI |
| DB-12 to DB-14 | The runtime role has a statement, a lock and an idle-in-transaction limit | WP-15 |
| DB-17, DB-19 | Run-time connections on the transaction pooler; the rehearsal with concurrent sessions passes | WP-15, WP-17 |
| DB-21 | The application's database connections verify the server certificate, before the import of members (SEC-13) | WP-15 |
| DB-24 | Storage works by service role and signed URL alone, proven in phase 0 | WP-17 |
| DB-26 | Point-in-time recovery and one restore drill | WP-15 (already a gate) |
| DB-27, DB-28 | One build path; the built database shows no unexplained difference from the expected model (the declared schema plus the registry of SQL-managed objects), by a CI check | WP-04, WP-15 |
| DB-31, DB-32 | The seed guard knows the new project; only the pilot entity is an active tenant | WP-04, WP-10, WP-15 |

**33 controls: 18 block the pilot (the rows above) and 15 do not** (DB-01 to DB-32 and DB-12a; the R2b text said 32 and left DB-12a out of the list below; review comment R2b-C14). Not blocking, and still part of the first setup: DB-03, DB-04, DB-05, DB-07, DB-11, DB-12a, DB-15, DB-16, DB-18, DB-20, DB-22, DB-23, DB-25, DB-29, DB-30. The owner accepted the blocking list on 2026-11-17, DB-21 and the repair of DATA-13 included, on condition of the corrections that R3 made to DB-06, DB-10, DB-27, DB-28 and DB-32: no control is accepted as a risk (`inputs/R3-owner-input.md`, answer 26).

## 14. Not verified, not measured

- Every setting marked `NOT VISIBLE` (part 10).
- Whether file storage works with the Data API off; whether a role setting reaches a connection through the provider's transaction pooler. Both are proven in phase 0 (part 2, step 4; DB-12).
- The right numbers for the three limits, and whether any pilot statement needs more than 15 seconds: no statement times were available (`log_min_duration_statement` is off on both projects; `pg_stat_statements` was not part of the exports).
- Any query plan or query time (part 8).
- Whether staging or today's production carry the effects of the four unjournaled files (Q9 answers it).
- The cause of the staging hang of 2026-11-12. The two traced paths would look like the note's description from the database (the outer transaction idle, the inner request waiting in the client); whether they are its cause is not established. DATA-13 itself is traced and not reproduced.
- The lead's exports themselves: this run cannot compare them with the databases.
