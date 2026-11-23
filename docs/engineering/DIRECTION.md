# DIRECTION — where the code goes, and in what order

> **Adopted from the review of 2026-11-13 (run A).** This document was written as a proposal for the owner and is kept as it was approved: where it says "draft", "proposed" or "would", read that as of the review. Documents named without a directory stand beside this one in `docs/engineering/`. Paths that begin with `A/`, `inputs/` or `shared/` cite the review record, which is kept outside this repository; they are evidence, not files to open here. Code paths and line numbers are those of commit `ef1bd0ef5`; a line number into another of these documents is that of the review, and a rule id, a work-package number or a part number is the stable reference.

| | |
|---|---|
| **Status** | Draft of run A, round R2 (2026-11-16): written in part R2a; corrected in part R2b after the independent review of R2a (`A/review/R2a-codex.md`; each change is listed in `A/review/R2a-response.md`) and with the owner's answers of 2026-11-16 (`inputs/R2b-owner-input.md`). Corrected in R3 (2026-11-17) after the independent review of R2b (`A/review/R2b-response.md`) and with the owner's direction and answers of that day (`inputs/R3-owner-input.md`). Corrected in the closing pass (2026-11-17) after the independent review of R3 (`A/review/R3-response.md`) and with the owner's decisions of that pass (`inputs/CLOSING-owner-input.md`). A proposal for the owner. It authorizes no work and changes no authority in the repository. |
| **Answers** | A13 (pilot direction) and A14 (is the foundation safe, and what comes first), as ordered work packages. |
| **Written from** | The R1 evidence as corrected (`A/R1-evidence.md`); the finding records (`A/outbox/findings.json`: 172 records, 116 active findings and one unverified lead); the owner's and the business owner's decisions (`inputs/R2-owner-input.md`, `inputs/business-owner-decisions-2026-11-15.md`); two fact-finding units of R2a (`A/raw/R2a/dir/`, produced on Opus 5.5). Where a fact from those units decides a gate or a disposition, the main session re-read the cited lines (`A/PROGRESS.md` §25.3). |
| **Source** | Interdomestik at `ef1bd0ef5c608d856615154921f9386f615d11de`. Paths without a prefix are in the repository at that commit. |
| **Companions (R2b)** | `CI-GATE-PROPOSALS.md` (the path of a PR and every check), `TECH-DEBT-REGISTER.md`, `DB-BASELINE.md` (the database of the new production), `REUSE-CATALOG.md`, `FEATURE-RECIPES.md`, the six `MODULE.md` files (one `MODULE.md` per deep-reviewed area) and `A/skills/`. Run B completes the group "later". |

## 1. The answer

**It is safe to keep building on this foundation. It is not yet safe to put real members on it.** No finding calls for a rewrite or another architecture. The destination you fixed — front door, proxy, authentication boundary, tenant context, domain packages, PostgreSQL with row-level security — is the shape the code already has. The weak points are where a rule sits outside its layer: in an entry point, in one provider's integration, in a memory note.

What changed since the first draft (R1, A13 and A14):
- **The pilot is defined.** One entity (Interdomestik DOOEL Skopje), by invitation, about 1,400 existing members imported, cash and company invoices first, five roles, three phases.
- **The payment provider is open.** No work goes into the Paddle integration. R1's first package, the repair of the Paddle event handling, is replaced by a provider-neutral payment port.
- **Production starts fresh.** The production findings are requirements of the first setup of a new project.
- **The interface is rebuilt.** Rules and packages are written for the new screens.
- **Two findings stand at S0.** Both are closed by small changes (WP-01).
- **One finding of R2b stands at S1** (SEC-11; reported to you in the session on 2026-11-16, 23:10Z). One list of trusted sign-in hosts serves every hosting environment. A production deployment therefore accepts the staging host, and a name pattern on the hosting platform's shared domain, as the place where a password-reset link may end. Anyone can ask production to mail a genuine reset link to a known address and have the valid token delivered to such a host; whoever reads it there sets the password. Two independent passes confirm it. It would be S0 if a person outside your hosting team could obtain a host name that matches the pattern. You decided on 2026-11-17 not to check that: the listed names are test hosts and are dropped. The finding stays S1, and its fix blocks the pilot: the new production trusts exact host names only, each environment has its own list, and every deployment that is not production sits behind the platform's deployment protection (WP-01; gate line 1; answer 28).
- **A second finding of R2b stands at S1** (DATA-13): two requests of the pilot cannot complete on the hosting platform. There each connection pool holds one connection, and nothing bounds a wait for it. The membership page of a member who is covered by a company agreement, and a staff decision "needs info" or "rejected" on a payment, each open a second database transaction while they hold the first, and wait for themselves until the platform ends the request. No test sees it, because off the platform the pool is larger. Traced line by line by three passes and the main session; not reproduced, because this run executes no code. The fix is two small changes and one test setting (WP-01).
- **The database of the new production has a baseline** (`DB-BASELINE.md`): 33 controls, each with the value on staging and on today's production, the recommended value, the reason, the query or test that verifies it, and whether it blocks the pilot. The largest items: the unused Data API and the privileges of its roles are switched off and revoked; the application's database roles get time limits; the database is built by one path and compared with the declared schema and with a registry of the objects that only SQL creates, because a database built from the repository today is not the one the schema declares (DATA-14).

The route has 19 work packages:
- **Six before any new feature** (WP-01 to WP-06): close the two S0 findings and the trusted-host list; make the one wrapper mandatory for new code; adopt the rules; close the dangerous database commands; switch on the checks of the screen contract; shorten the path of a PR.
- **Thirteen before the pilot** (WP-07 to WP-19): the payment port and its three channels; the import; the controls of a closed pilot; claim rules and notifications; the case fields and the correspondence register; privacy; the member-relationship minimum; the first production setup; the tests; the rehearsal; the pilot screens; the one entry door on `ida.*`.
- **Later**: a provisional list (part 5, group 3). Run B completes it.

Numbers, by script (`A/raw/R3/findings-reconcile-R3.json`): 116 active findings: S0 2, S1 11, S2 70, S3 33. Fifty-seven have two skeptic passes, among them every S0 and S1 finding. R2b added seven findings (SEC-11 and DATA-13 at S1; MAIN-21, SEC-10, DATA-14, SEC-12 and SEC-13 at S2) and corrected four records without changing a level. R3 lowered one level after the independent review (SEC-12, to S3), wrote your decisions of 2026-11-17 into nineteen records without changing a level, recorded one **unverified lead**, which is counted in no total (CASE-13, part 13), and added one finding of its own at S3 (MAIN-22: three required checks pin the wording of the instruction files; WP-03).

**Your answers of 2026-11-16** to the five decisions the first version asked for (`inputs/R2b-owner-input.md`), all applied below:
1. **The repository becomes private**, after a dated check of what GitHub Actions and SonarCloud cost for a private repository. Until then no signed evidence and no data export enter it; the held PR that removes the ten scans changes the release-evidence check in the same merge; the names in `production-evidence.yaml` fall under the same decision. Rewriting history stays a separate decision of yours. **The deadline is your decision of 2026-11-18** (part 12): private before the earlier of the pilot opening or the first import of real member data. (MAIN-15, S0; WP-01.)
2. **Phase 1 opens with only the new pilot screens built new.** It does not wait for the full rebuild. (WP-18.)
3. **The new production opens on `ida.*` from its first day.** The remaining cutover work is planned into phase 0. (WP-19, new.)
4. **The dispositions of part 4 are accepted.** The tracker stops being a statement of state; state is kept per item.
5. **A sale uses the latest weekly NBRM rate in force at the moment of the sale**, and stores the rate, the rate's date and the amount in MKD. The business owner's wording is read this way; one line of confirmation from the business owner is an owner check, not a condition of the design. (WP-07, WP-08.)

You also settled the gate question that the independent review raised: **the bank's written approval is required before opening**, and the card journey is rehearsed in the bank's test environment in phase 0; the approvals for company memberships are unconditional; only the medical approvals may be met by keeping injury cases switched off (part 6.2). The rehearsal of the card journey has moved since, by your answer of 2026-11-23 (below).

**Your answer of 2026-11-23** ("Accept all", to the lead's recommendations on the fast-pilot review; its decisions D4 and D5), applied below:
- **The card rehearsal has its own gate.** The bank's written approval stays a condition of the opening (gate line 17). The card journey rehearsed in the bank's test environment moves out of phase 0 to a gate of its own, before the first card payment; no card payment is taken before it. Phase 0 can end with cash and company invoices, and the reconciliation of the card channel is shown at the card gate (WP-08; part 6.1; gate lines 17 and 21).
- **Five pieces of work move behind the opening**, each with a control until it lands:
  - WP-10 unit U2, the static closure predicate of the public-entry registry: the registry check and the tests of the closed entries stand in.
  - WP-13b-1, the software for privacy requests: the written, rehearsed procedure for deletion and export serves every request (gate line 12). The stored acceptance stays before the opening.
  - The alias redirects of WP-19 and the move of the E2E projects to the door: before the opening only the door is attached to the new staging and the new production, no country host exists there, and each moved journey is listed with its replacement.
  - The remainder of WP-06 and the follow-up checks of WP-03 (CHK-01, CHK-02, CHK-03, the hooks): no gate line names them; the reviews of R-01 and R-02 stand in. The throughput changes accepted in the same answer still come before the opening.
  - Run B: it completes the group "later" after the opening. The load measurement of run C moves into phase 0.

**Your direction of 2026-11-17** (`inputs/R3-owner-input.md`, §1) governs every recommendation below. Everything that exists today is a test environment and may be deleted. The goal is resilient, professional development: by one person with agents today, by more people later. The infrastructure may be reorganised, and setting up the new environment correctly comes before inspecting or repairing the old one. A defect in the code is still a defect. A finding whose level depends only on how an old test environment is configured becomes a rule for the new one. Two limits: what is already published stays published (the scans of MAIN-15), and the brand domain with its mail records is real.

What that changes here:
- **Nothing in the code packages.** Every work package stands.
- **Part 8 is where the old environments' findings live on**, as requirements of the first setup of a new project.
- **No effort goes into the state of staging or of today's production.** The findings that were argued from that state keep their level and name the rule for the new environment: BIL-03, BIL-11 and MAIN-20 (staging's payment destination); MAIN-14 and POPS-03 (today's production); the open condition of SEC-11; what the existing projects expose through the Data API (SEC-12).
- **The checks that were asked of you about the old environments are withdrawn** (questions 17, 26 and 28).

**Your answers of 2026-11-17**, all applied (part 12 lists each): the public company form is closed in phase 1; a company employee's paid membership runs to its paid-through date; the pilot levels of part 6.6 are confirmed and written into the records; the correspondence register is decided; Astra reviews all HIGH work, at high effort or above; the severity rubric has no size threshold and covers delivery and agent paths; gate evidence comes from a dedicated macOS machine with a recorded configuration; standing approvals lapse at adoption; `.agent/` leaves with the adoption PR; tier T3 widens once two checks run; a status the member can see notifies the member; no checkout is linked to a shared project, and no agent tool reaches production, merges or force-pushes; each environment trusts exact host names only; the delivery-speed targets and four gate decisions are accepted; the blocking list of the database baseline is accepted with the corrections of R3; the seven decisions that lived only in memory notes are written into the module contracts.

**What the closing pass changed in this document** (after the independent review of R3 and with your decisions of that pass; `A/review/R3-response.md`): questions 32 to 40 are answered (part 12); WP-12 has acceptance criteria for the revocation of an authority and for what an outward action needs (review comments R3-C03 and R3-C04); WP-03 names the rule that carries what six override files demanded (R-37), the two conditions of your approval of the three changed checks, and two more follow-ups; part 8 says that staging is a new project too and that the recovery objectives are approved. Two records were superseded without a change of level (CASE-03 and MAIN-22).

What the independent review of R2b changed in this document: one row of public entry points (the E2E helper route is closed by a secret, not by the environment; part 6.1a, WP-10); the level of SEC-12 (S3); the wording of the build check and of the role attestation (part 8, lines 3 and 12); question 31, of which three points were engineering choices; the file counts of the recipe behind WP-12. Its other corrections are in the companion files (`A/review/R2b-response.md`).

What the independent review of R2a changed in this document, in one place: the list of public entry points was wrong and is rebuilt from the code (part 6.1a, WP-10); a membership of a company employee needs a verified payment **and** an approved list (WP-07, gate line 3, trigger (c)); the guard for destructive scripts is specified so that it proves what it promises (WP-04, gate line 10); the end of a company agreement and the yearly cap have acceptance criteria (WP-09); notices are tested for interruption and failure, not only for repetition (WP-14).

The owner questions that remain open are in part 12.

## 2. The destination, and where the code stands

| Layer | What exists today | Rules that move the code there | Packages |
|---|---|---|---|
| Front door `ida.*` | Recognised as a neutral host. The country hosts still resolve to tenants through a table in code. The single-login cutover sits behind a flag that is off, and that appears in no environment example and no workflow (`apps/web/src/lib/feature-flags.ts:17-21`; ADR-12) | R-34, R-17, R-30 | WP-19 |
| Proxy | `apps/web/src/proxy.ts` (10 lines) hands over to `apps/web/src/lib/proxy-logic.ts`. Its matcher covers pages and excludes `/api`. It is the routing authority for pages and the session gate of the portals; it is not the tenant boundary | R-34, R-04 (tier T5: the owner approves), R-23h | WP-10, WP-19 |
| Authentication boundary | Better Auth through `@interdomestik/shared-auth`: one authority (R1, A8) | R-30 | keep |
| Tenant context | The tenant-authority capability: 523 call sites use it, and it fails closed (A8). Two values reach the database: the home tenant and the access tenant | R-17, R-06 | WP-15 |
| Domain packages | 24 packages with one-way dependencies and no cycle (A6). But 124 of 348 write sites are in the web app, 24 of 81 written tables have more than one writer (MAIN-07), and no check enforces layers inside the app (MAIN-06) | R-05, R-15, R-16, R-18, R-19, R-20 | WP-02, WP-05, WP-07, WP-11 |
| PostgreSQL with RLS | Row policies on the tenant tables, proven by 24 real-database suites in CI. Nothing in the repository migrates staging or production (DATA-03) | R-06, R-12, R-13 | WP-04, WP-15 |

For each of the 35 rules, the table at the end of `RULES.md` names the layer it serves.

## 3. What the pilot runs on: keep, fix, replace, retire

You asked that the pilot platform carries forward only what the evidence shows is sound and fits the business. One row per component on the pilot path. "Keep" means: do not rework it.

| Component | Verdict | Evidence | Package |
|---|---|---|---|
| Identity and sessions (Better Auth, `shared-auth`) | **Keep** | One authority; no bypass found on the traced paths (A8). Open: sign-in is throttled per pair of e-mail and address only (SEC-03) | WP-15 for SEC-03 |
| Tenant authority and row policies | **Keep** | No cross-tenant path on the traced journeys; fails closed (A8); 24 suites in CI | WP-15: role attestation (TEN-01) |
| Proxy | **Keep**, change only with your approval | 10 lines plus the logic modules it hands over to; the E2E gates depend on its routes; it is never routed around (R-34) | WP-19 changes its admission, one approved change at a time. WP-10 does not need it: the closure of sales and sign-up is in server code, because the proxy does not see `/api` |
| Claim intake and evidence upload | **Keep** | Duplicate-safe creation, server-built paths, signed upload intents (A10). Upload internals partly unreviewed | WP-12 adds fields |
| The claim transition command | **Keep** | One transactional writer of status, history and event; the best-built part with the tenant boundary (A14) | — |
| Entry points around that command | **Fix** | The admin entry point is silent to the member (CASE-03, S1), skips the decline reason (CASE-04), and five entry points are rendered nowhere (CASE-11) | WP-11 |
| Notifications | **Fix** | No operator is ever notified (CASE-02); a member message notifies nobody (CASE-06); sends are fire-and-forget (CASE-07); e-mail and push are English while the default locale is `sq` (SCTX-03) | WP-11 |
| Server actions and API routes | **Fix** | 232 exports with opt-in authorization (SEC-06); one unvalidated write (SEC-02, S0); at least 13 result types and 24 context helpers (DUP-02, DUP-03) | WP-01, WP-02 |
| Paddle integration (123 files) | **Not on the pilot path.** Park it; repair nothing | Provider open (owner). No provider-neutral interface exists; billing-entity resolution is a table in code (`packages/domain-membership-billing/src/paddle-server.ts:59-68`) | WP-07 makes it one adapter |
| Membership period and lapse | **Replace** inside the payment port | Access is decided from the status only; nothing ends a membership by date unless a provider event arrives (BIL-06, S1; `packages/domain-membership-billing/src/subscription/lifecycle-reporting.ts:52-83`) | WP-07 |
| Cash sale with staff verification | **Keep** the verification, **fix** the rest | Verification before activation exists, with branch scope and a refusal to verify one's own lead (`apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts:28-38`; the rule sits in the web app, not in a domain package). Missing: custody states, numbered receipts, collector accounts, daily close, bank transfer (`packages/database/src/schema/leads.ts:113-167`: methods `card` and `cash` only) | WP-08 |
| Company roster import | **Keep** the skeleton, **fix** the gaps | Present: term and revision; a seat count per approved revision of at most 500 by a database check, counted over all uploads of the contract year once a revision is approved (`packages/domain-membership-billing/src/sponsors/roster-upload.ts:110-128,137-163`; `packages/database/src/schema/sponsors.ts:166`); a termination command; audit rows; a per-tenant switch that is closed by default; no stored file. Missing: preview, per-row errors, duplicates across sources before anything is written, the broker as a source, an imported end date, a payment reference, and a verified payment as a condition of activation: an approval may carry no invoice reference, and provisioning writes `active` without one (`sponsors/decisions.ts:32-35,85-94`; `sponsors/provisioning-effects.ts:71-91`) | WP-07, WP-09 |
| Older agent group import | **Retire** | A second import path with other behaviour: a paused subscription without dates and no e-mail (`apps/web/src/lib/actions/agent/register-member.core.ts:116-157`) | WP-09 |
| Renewal notice and mail outbox | **Keep and widen** | A 30-day notice with a stored delivery state exists, for sponsored members only (`sponsors/mail-producers.ts:40-55`; `packages/database/src/schema/sponsor-roster.ts:121-166`). No scheduler in the repository runs it | WP-14 |
| Scheduled work | **Fix** | One of six cron routes has a scheduler (MAIN-11); engagement mail exists twice (SCTX-09); failures leave no cause (SCTX-07) | WP-14, WP-15 |
| Member-relationship packages (`domain-crm`, `-leads`, `-communications`, `-activities`, `-referrals`) | **Unreviewed.** Use only the phase-1 minimum; add nothing before run B reviews them | Owner input §3 | WP-14, run B |
| Privacy functions | **Fix**, by procedure first | A deletion request is stored and nothing can act on it; no export; no retention job (POPS-01, POPS-02, POPS-06); acceptance at registration is shown and not stored (POPS-05) | WP-13 |
| Correspondence with insurers and bureaus | **New** | No structure can hold it: a message sender must be a platform user (`packages/database/src/schema/claim-support-tables.ts:52-54`) | WP-12 |
| Role model | **Keep** the nine values, **fix** provisioning | The role is free text with no constraint (`packages/database/src/schema/auth.ts:19`); an entity administrator can grant `branch_manager` and `promoter` without the operator (`packages/domain-users/src/admin/role-rules.ts:14-22`) | WP-10 |
| Medical documents | **Defer** injury cases on the platform, unless the measures are verified | No role or purpose gate exists for medical documents; claim documents have no medical class (`packages/database/src/schema/enums.ts:7-14`). The business owner's own condition says: defer if not verified | WP-12 (switch), business gate |
| Professional recovery and success fee | **Keep dark** | Out of the pilot. No switch keeps it dark today; the fee has no ceiling and a second save overwrites the first (POPS-07, POPS-08) | WP-10 |
| Today's screens | **Replace** by the redesign | Owner decision (concept A) | WP-05, WP-18 |
| Release path to production | **Replace** | No migration step, no rollback that is shown to work, no release since 2026-07-02 (DATA-03, POPS-04, MAIN-05); the staging pipeline failed 49 of 141 runs in November (MAIN-13) | WP-15, WP-17 |
| Required checks and tenant guards | **Keep**, every one, until you approve a change | Mandatory gates (`RULES-MAPPING.md`, part 3). Their admission cost is a finding (MAIN-01, MAIN-19) | WP-06 |
| Instructions for agents | **Replace** | `AGENTS.md`; 540 rows of old rules mapped, 157 of them still `UNREVIEWED` and kept in force (`RULES-MAPPING.md`) | WP-03 |

## 4. The M0–M5 architecture program: a disposition per item

**What the repository records.** The program is `docs/plans/architecture-finalization-program-2026-05-29.md` with its tracker. Both are marked `plan_role: input` and `source_of_truth: false`, and `docs/plans/current-program.md:398-400` makes the work conditional on explicit promotion. All 82 task rows of M0 to M5 in the tracker read `DONE`. No record was found that evaluates a milestone's exit criterion or the program's definition of done (`A/raw/R2a/dir/architecture-program.md`).

**What the code shows.** "Done" in the tracker means that a slice was merged. For three milestones the exit criterion, as the program words it, does not hold at the pinned commit:
- M2 ("two machines authoritative"): `domain-case` is two files of types, `domain-recovery` is 12 files imported only from `domain-claims`, and `domain-claims` has 160 files and implements both.
- M3 ("one resolver is the only producer of tenant truth; the host never implies the tenant"): the four-context resolver (`apps/web/src/lib/tenant/tenant-context.ts:77`) is imported by tests only; the host resolves to a tenant through a table in code (`apps/web/src/lib/tenant/tenant-host-aliases.ts:22-43`).
- M5 ("`ida.*` is the sole login"): the cutover flag is off and absent from the environment examples and from CI.

This is not a defect of the code. It is a status record that says more than the code does. **You accepted on 2026-11-16** that the tracker stops being a statement of state and that the state is kept per item: here, and in the `MODULE.md` drafts (the six `MODULE.md` files), which say for each area what is live and what is not.

| # | Item | Disposition | Stage | Evidence |
|---|---|---|---|---|
| 1 | **Named tenant contexts** (home, access, legal, recovery, booking, host) | **Keep** what is live: home and access tenant in the database, the row policies on the access tenant. **Defer** legal, booking, recovery and host as separate contexts until a second entity is active. The uncalled resolver is marked "not live"; it is wired or removed with the second entity | Live part: pilot. Rest: all customers | Two of six values reach the database (`packages/database/src/tenant.ts:38-41`). 34 tables have a tenant policy; 8 carry `access_tenant_id`. The session has seven extra fields and none of them is an access, booking or legal tenant (`apps/web/src/lib/auth/schema.ts:17-53`). One entity in the pilot: home and access are the same tenant. Three generations of tenant entry coexist in the code (TEN-05) |
| 2 | **Entity of record and legal snapshots** | **Change: pull the writer forward.** Each membership stores, when it is sold or activated, the entity of record, the governing law and the version of the terms accepted | Pilot | The columns exist (`packages/database/src/schema/subscriptions.ts:59-62`); nothing writes them at acceptance. Real members accept terms from the first day; POPS-05 shows the acceptance is not stored |
| 3 | **Split of `tenants`** into legal entities, marketing hosts and booking links | **Keep** `legal_entities` (it is read). **Defer** the two tables that nothing reads | All customers | `marketing_hosts` and `default_booking_links` have no runtime reader |
| 4 | **Domain events** | **Keep** the event table as the case history: the member timeline reads it. Build nothing new on the relay until a scheduler runs it | Pilot: the table. Relay: all customers | 9 writers, 13 allowed event names. The relay, the audit projection and the cache relay have no runtime caller. Pilot notifications use a delivery record (WP-11), not the relay |
| 5 | **Audit derived from events** | **Defer**, and decide in run B which is the audit authority: the direct audit rows or the projection | All customers | The projection is uncalled. Audit rows are written directly, and they can be changed or deleted (DATA-06) |
| 6 | **`ida.*` single-login cutover** | **Keep, and do it before the pilot**: the new production opens on `ida.*` from its first day (your decision of 2026-11-16). The open steps are work package WP-19, in phase 0 | Pilot | A fresh production has no existing members to move; opening on a country host would mean moving about 1,400 activated members later. The cost stays what it was: proxy and authentication work (tier T5), the aliases still underpin required gates (ADR-12), and the size of ADR-12's open steps is `NOT MEASURED` |
| 7 | **Host and tenant literals** | **Change** before the second entity: host-to-tenant and the `host_id` constraint read the registry | All customers | Literal tenant ids stand in about 30 runtime files and one CHECK constraint (`packages/database/drizzle/0089_domain_events_host_id.sql:12`). A new entity is a code change and a migration today. The business owner considers the next entity after six months of production |
| 8 | **Case and recovery as two packages** | **Defer** the package split. **Keep** the two lifecycle states and the single transition command | Enterprise | Recovery with a success fee is outside the pilot. The split is real only at the type boundary |
| 9 | **Product model** (offer, proof, workspace; disclosures) | **Change**: the pilot needs a small catalogue without provider names, and a stored record of each sale: what was shown and accepted. **Keep** the type-level split | Pilot: sale record. Persisted disclosures in general: all customers | Plans carry `paddle_price_id` and `paddle_product_id` (`packages/database/src/schema/membership-plans.ts:32-33`). The disclosure is derived when a page is read; nothing stores what a member was shown. The owner asks that each sale stores rate, date and amount |
| 10 | **Payment**: "no billing abstraction; Paddle stays direct" (`docs/plans/architecture-finalization-program-2026-05-29.md:340`) | **Drop** this constraint; replace it by the payment port | Pilot | Owner decision of 2026-11-15 |
| 11 | **Guardrails of M0** (single status writer, `canTransition`, role exhaustiveness, the "compensation guaranteed" lint) | **Keep**. WP-11 completes their intent | Pilot | The transition command is sound; the open defects sit where a rule stayed outside it. The lint matches the business owner's rule that the membership never promises compensation |
| 12 | **The 150-line file guard** (T-007b) | **Carry to R2b** as a removal candidate under the A5 conditions | — | The current `AGENTS.md` rejects a universal limit; three old rules name three different limits (`RULES-MAPPING.md`, part 5) |
| 13 | **Entity migration, sponsored seats, success-fee charging through Paddle** | **Park**: extend nothing. Run B proposes keep or retire | Enterprise | No caller outside the package for the migration executor and for the success-fee relay. Charging a success fee through the membership provider conflicts with business rule 5 |
| 14 | **AI call context and consent** | **Defer**; keep it switched off | After the pilot | AI reading of documents is outside the pilot; consent cannot be withdrawn (POPS-09) |
| 15 | **Recovery law packs** (`mk`, `xk`) | **Defer** | Enterprise | Two packs, and nothing on a live path loads them; other countries resolve to guidance only |

**Departures from the recorded baseline** (accepted by you on 2026-11-16): items 2 and 9 are pulled forward; item 6 is done before the pilot; items 1, 3, 4, 5, 8, 13, 14 and 15 are deferred although the tracker records them as done; item 10 is dropped by your own decision; the tracker stops being a statement of state. This acceptance changes no file of the repository: the program documents keep their text until the adoption PR (WP-03).

**One lead, settled twice.** The first version of this document said that Free Start stores one technical row without a person and that "no request and no person is assigned to Kosovo by it". The first half holds; the second does not, and it is corrected here (found while answering review comment R2a-C01; record MAIN-21). Free Start stores three things, each re-read by the main session at the pinned commit:
1. **The intake** (`apps/web/src/actions/free-start/submit.core.ts:40-64`): one idempotency row without a name, a contact or a case, in the partition of the host — the Macedonian tenant for the Macedonian host, the Kosovo tenant for every other host.
2. **An account**, when the visitor verifies an e-mail address to save a draft. On the neutral door the verify request is rewritten with the default public tenant and the mode "deferred" (`apps/web/src/app/api/auth/[...all]/neutral-otp-route.ts:25-32`), and the new user row takes that tenant with the mark "classification pending" (`apps/web/src/lib/auth/user-authority-assignment.ts:43-55`). The default public tenant is the value of one environment variable, **and Kosovo when the variable is unset** (`apps/web/src/lib/tenant/tenant-hosts.ts:31-33`).
3. **The drafts** of that account, stored only while the account's tenant equals the default public tenant (`apps/web/src/actions/free-start-drafts/session.core.ts:82-88`).

So a person with a verified address and their drafts are placed in the Kosovo tenant by a default in code, marked as not yet classified. That is against business rule 2 ("never place anyone in Kosovo by default") and against the business owner's rule for Free Start, that a draft is stored only with a verified e-mail, a determined entity and that entity's data protection (1.8). No real person is affected today: staging and today's production hold test users only. The consequences: Free Start and registration by code are closed on the server in phase 1 (WP-10); the new production sets the default public tenant explicitly and refuses to start without it (part 8, line 8); Free Start is rebuilt under rule R-17 before phase 2 opens it (part 6.5).

## 5. Work packages

Effort: S is up to about ten files, M up to about thirty, L up to about seventy, XL more. Where R1 counted files, the count is given; for new work the size is an estimate from the list of missing parts, not a measurement. Hours are `NOT MEASURED`. Tiers T1 to T6 are those of rule R-04.

**A work package that adds tables** (your answer of 2026-11-23: "yes") shows in its PR, for each new table: a tenant-first index for each read path; `EXPLAIN ANALYZE` on a realistic volume; no N+1 query; pagination of every list; and an estimate of its budget.

### Group 1 — before any new feature

#### WP-01 — Close the two S0 findings, the trusted-host list and two requests that cannot complete; delete four unguarded exports

| | |
|---|---|
| **Goal** | No request can write another user's row. No personal document is published with the source. A production deployment hands a reset token to no host but its own |
| **Resolves** | SEC-02 (S0), MAIN-15 (S0), SEC-11 (S1; its open S0 condition was closed without a check, answer 28), DATA-13 (S1; its two code paths), SEC-01, SEC-04, SEC-10 |
| **Touches** | `apps/web/src/app/api/settings/notifications/` (remove the route, which nothing calls, or parse its body with the strict schema of `packages/domain-users/src/user-settings/`). `docs/release/evidence/` (ten scans), `scripts/release-evidence-check.mjs`, `docs/release/production-evidence.yaml`, the two intake procedures. `apps/web/src/actions/thank-you-letter*.ts` and `apps/web/src/actions/commissions.ts` (delete the server exports). `apps/web/src/actions/leads.core.ts` with its re-export and the dialog that alone imports it (`apps/web/src/components/claims/call-me-now-dialog.tsx`, rendered nowhere): the action inserts a lead row for a caller without a session and has no rate limit (SEC-10). `apps/web/src/lib/auth/utils.ts:36-66` and its test (`apps/web/src/lib/auth/config.test.ts:33-51`), and the guard before the identity library (`apps/web/src/app/api/auth/[...all]/route.ts`): a list of trusted hosts per environment that fails closed — production holds only the names its own deployment serves and no name pattern on a shared domain; the public reset request accepts only a relative path or its own origin as the target; the audit event records the target (SEC-11). `apps/web/src/lib/entity-disclosure.core.ts:71-80` with its caller `apps/web/src/app/[locale]/(app)/member/membership/_core.ts:82-94`, and `apps/web/src/lib/notifications/recipient-role.ts:12-26` with `apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts:164-179`: the inner read takes the transaction of its caller, or the notification moves behind the transaction (DATA-13); the test configuration of the tenant and role tests (a pool of one connection) |
| **Effort, risk** | S. Low for the code, except the host list, which is authentication (tier T5) and breaks sign-in on a host that is left out: it is proven per environment before it merges. The scans cannot be withdrawn from history: that part is a decision and a notification, not a code change |
| **Needs first** | Your approval for the change of the release-evidence check (tier T6). The visibility is decided (private, after the dated cost and capability check and before the earlier of the pilot opening or the first import of real member data; your decision of 2026-11-18); until the switch, nothing signed and no export enters the repository, and privacy never permits a personal document in it |
| **Done when** | A request with an injected `userId` or `tenantId` is refused, by a test, or the route is gone. `git ls-files` holds no image-only PDF, and the release-evidence check passes on a manifest of hashes. The four exports are gone. The removal of the scans and the change of the check are merged together. In a production-shaped context, by tests: a reset request that names the staging host, a generated deployment host or any other foreign origin as its target is refused, and no mail is sent; a request without a target, or with a relative path, works; the staging and preview contexts accept their own hosts and not production's. In a production-shaped process with one connection per pool, the membership page of a covered member renders and a "needs info" decision is stored and notified once; the tenant and role tests run on a pool of one connection (CHK-06) |

#### WP-02 — One wrapper for every server mutation: the contract and the check first

| | |
|---|---|
| **Goal** | Authentication, a declared authorization basis, a strict schema, one result type and error capture in one place. No new mutation outside it |
| **Resolves** | SEC-06, DUP-02, DUP-03, SCTX-16, and the class of SEC-02 |
| **Touches** | `apps/web/src/lib/safe-action.ts`; `apps/web/eslint.config.mjs`. The registry of public entry points (CHK-26). Then the 92 files with server actions, of which 76 do not reach the wrapper (14 call it, 2 only re-export from a caller; recount of R2b), moved screen by screen with the rebuild |
| **Effort, risk** | M for the contract and the check; XL for all existing actions, which is not a precondition. Medium risk: about 50 guards rely on a plain "Unauthorized" error, so the typed error and the guards change together. Tier T5 |
| **Needs first** | WP-01, so that the baseline is counted after the deletions |
| **Done when** | CHK-04 and CHK-05 run in the lint job. The baseline lists every exported action that is not built by the wrapper with a declared basis and a schema: all 232 on the first day, since the wrapper takes neither today. No new one is admitted, and the number only falls. A refusal by the wrapper is recorded (the basis of trigger (a), part 6.4) |

#### WP-03 — Adopt the rules: one adoption PR, and the changes outside the repository

| | |
|---|---|
| **Goal** | One source of rules; the roles as you decided them; no instruction that restarts a retired program |
| **Resolves** | MAIN-16, MAIN-17, MAIN-09, MAIN-02, MAIN-22 |
| **Touches** | **One adoption PR; its exact list is `A/ADOPTION-PR-FILES.md`** (48 paths, staged and checked under `A/adoption-pr/`): `AGENTS.md`, `CLAUDE.md`, six `MODULE.md`, the documents of `docs/engineering/`, three pointer files, the role lines of two Codex role files and of the development guide, the removal of `.agent/` and of six override files, whose stop, review and authorization one rule of `AGENTS.md` now carries (R-37; closing pass, review comment R3-C01), while what the file for the API routes asks with every contract change is carried by the API record of R-04 (your decision 1 of 2026-11-18) — **and three checks that pin today's wording**, brought along in the same PR, because without them the required checks `audit` and `pnpm-audit` refuse it (MAIN-22, found in R3); every assertion and every mutation of the three is accounted for (`A/ADOPTION-PR-FILES.md`, part 3; closing pass, review comment R3-C02). It touches no workflow. After it, each in a PR of its own. **First the marker of the verification machine with its check in the verify script, in the PR that immediately follows the adoption PR** (your answer 39 and your decision 2 of 2026-11-18). Then the split of `RULES.md`, which is the first edit of that file (your decision 5). Then the instruction-drift check (CHK-02), the hooks (`.claude/settings.json`), the review record (CHK-01), the change-policy script (CHK-03), and the removal of the slice runners (your answer 32). Outside the repository, by the lead: the skills, the memory entries, the Codex configuration |
| **Effort, risk** | S for the adoption PR, which is staged; M for the follow-ups. Low risk. Tier T6; it is not instruction-only, because it changes one script and two tests, so the local verification runs |
| **Needs first** | Your approval of the drafts as they stand after the final round of 2026-11-18. Your approval of the change to three checks is given on two conditions (answer 36): the missing assertions and mutations are restored, which the closing pass and the delta fix round did, and the lead's delta check passes; its focused final check is due. **WP-01's fixes merged before the adoption PR; privacy is not a substitute** (your decision 6 of 2026-11-18): the adopted documents describe open S0 and S1 defects, and the repository is public until its dated switch. The main checkout unlinked from the old production, as the proposed `CLAUDE.md` states. One thing should not wait: if the Claude `interdomestik` skill is still installed, its trigger is disabled before the next development session |
| **Done when** | The adoption PR is merged with every required check green. Of the five lines that give integration to another party today (MAIN-16), the three in live instruction files are gone, with all eight clear role conflicts of the drift check's baseline; the two in `docs/plans/current-program.md` stay until that document is retired with the split of `audit` (WP-06), because the plan audit reads its text today. Then: the drift check passes on the live instruction paths, and every merged change of tiers T4 to T6 has a review record that names the merged commit. **After the opening** (your answer of 2026-11-23): these follow-up checks (CHK-01, CHK-02, CHK-03, the hooks); until they land, the reviews of R-01 and R-02 stand in |

#### WP-04 — One road for schema changes; destructive scripts confined to disposable databases

| | |
|---|---|
| **Goal** | A schema change reaches a database only as a journaled migration. No loose script that drops or deletes exists in the tree, and a destructive script written later can connect only to a loopback database or to the CI container |
| **Resolves** | DATA-04 (pilot blocker), DATA-05, DATA-02, DATA-12, DATA-14 (the build path; its use for the first production is WP-15) |
| **Touches** | `packages/database/package.json:33,37` and the root `package.json:251` (three push scripts), `scripts/database-security.sh:110`; the seven scripts that write or change schema with a database client of their own — the four of DATA-04 (among them `scripts/drop-legacy-tables.mjs`), two that change the row policies of whatever database the address names (`scripts/apply_hardening.js`, `scripts/harden_storage.js`) and the role set-up of the CI database — which are deleted or moved behind the guarded import; the eleven read-only tools that open their own client, each deleted or listed with its reason; `packages/database/src/seed-target-guard.ts` (one exported assertion that accepts only the classifications `local` and `confirmed-ci`); `scripts/check-drizzle-migration-journal.mjs` (its allow-list of four files is emptied); the four migration files outside the journal, whose statements move into journaled migrations — the tenant defaults dropped, the declared indexes created; the unused directory `packages/database/migrations/`; a CI step that builds a database from the journal and compares it with the declared schema (`DB-BASELINE.md`, DB-27 and DB-28) |
| **Effort, risk** | S. Low. The second, unwired migration runner (23 files; DATA-11) is not touched here |
| **Needs first** | Nothing |
| **Done when** | CHK-12 and CHK-13 pass. A database built from the journal equals the declared schema, by the CI comparison: no default on a tenant column (31 today), every declared index present (four are missing today). No package script runs an unguarded push, and journal timestamps increase with the index. No script opens a database client of its own outside the reviewed list (18 of 697 script files do today, 7 of them writing; `A/raw/R2b/gates/chk13_own_client.py`). The disposable-target assertion refuses, by test: an arbitrary remote host with a valid confirmation and a strong password; the staging project; a project reference the guard has never seen, which is what a newly created production project is; a pooler host. It accepts loopback and the CI container. Every script takes its client from the guarded import behind that assertion; the unit of the check is the opened client, not the statement, because a pattern of statements missed one of the four scripts. **Not sufficient, and corrected from the first version:** a call to `assertSeedTargetAllowed`. That function admits any confirmed remote target (`packages/database/src/seed-target-guard.ts:207-219`) and knows production only by one project reference written into the file (`:10`, `:75-98`) |

#### WP-05 — The checks of the screen contract, before the first new screen

| | |
|---|---|
| **Goal** | A new screen cannot copy today's weak connections to the backend |
| **Resolves** | MAIN-06; the classes behind POPS-05, SCTX-14 and SCTX-03 for new code |
| **Touches** | `apps/web/eslint.config.mjs:77-89` (the boundary rule allows everything by default), `packages/ui/package.json` (declared exports), the path wildcards in the two `tsconfig.json` files; CHK-09, CHK-15, CHK-22 |
| **Effort, risk** | M. Medium: false refusals on old code are avoided by starting each check at zero for new screens and exempting today's components until they are rebuilt |
| **Needs first** | Nothing. It must be in place before WP-18 starts |
| **Done when** | A new screen fails the lint if it imports the database package, reaches past a package's exports, formats a date or an amount by hand, or shows a consent control that is not in the payload. For accessibility, the lint rules that ship with the framework's configuration run today; an automated pass inside the gate journeys is proposed, and its tool is not verified |

**The screen contract, and what checks each clause** (rule R-23; the full table with evidence is in `RULES.md`). A new screen:

| Clause | A new screen… | Checked by |
|---|---|---|
| a | sends every mutation through the one wrapper | CHK-04, proposed |
| b | takes the tenant from the session and reads through the tenant boundary | The tenant guards, today; CHK-15, proposed |
| c | imports neither the database package nor a deep package path | CHK-15, proposed |
| d | ties loading, empty, error, retry and pending to the real end of the request | Advisory; one component test per screen |
| e | transmits and stores every consent it shows, with version and time | CHK-22, proposed, and a test of the stored record |
| f | has its copy in the five locales and formats through the shared helpers | `pnpm i18n:check`, today; CHK-09, proposed |
| g | meets WCAG 2.2 AA | Lint rules today for what a linter sees; the rest advisory |
| h | keeps the `page-ready` markers and the canonical routes | The E2E gate journeys, today |

#### WP-06 — Delivery speed: the critical path of a PR

| | |
|---|---|
| **Goal** | Less time from push to a mergeable change, without losing a check that catches defects. A routine schema change, locale addition or dependency update passes the tenant guard without a second PR |
| **Resolves** | MAIN-01 (S1), MAIN-19, MAIN-03, MAIN-04 |
| **Touches** | The workflows: `pr-finalizer` removed; one build per head, shared by the pilot runner and the browser lanes; the browser lanes side by side; `audit` split into a job for code and schema and a job for the delivery tooling; `unit` on two machines; then lanes by risk tier, decided once in `validation-surface`. The two tenant-guard workflows and the guard's source (53 files, pinned by the owner) for the admission cost |
| **Effort, risk** | L. High: every change here concerns a mandatory gate, follows the A5 conditions and needs your approval. Tier T6 |
| **Needs first** | Your decisions on `CI-GATE-PROPOSALS.md`, part 7.2 (question 29), and the step times of the 40 sampled heads, which the lead can read in an hour. **What that document found** (lead's export, arithmetic recomputed; workflows read at the pinned commit): the checks of a PR take a median of 34 minutes because the browser job takes 30.5 and the required check `delivery-gate`, which runs no test, waits for it and for twelve other checks; the second chain, `audit`, takes 19.5 minutes. Every PR that is not a draft runs every heavy job: a PR that changed `AGENTS.md` and one plan document took 25.9 minutes. The required check `pr-finalizer` validates nothing. The application is built twice and a database is migrated three times per PR. No test is removed by any proposal |
| **Done when** | The target you approve is met on 20 consecutive PRs; proposed: a median of 15 minutes and a 90th percentile of 20 for a product PR, 5 minutes for a documentation or copy PR, with the wait for review reported apart. The list of executed tests per head equals the list before the change. No separate admission PR for a routine change (19 in November). **After the opening** (your answer of 2026-11-23): the remainder of this package, apart from the throughput changes accepted in that answer |

### Group 2 — before the pilot

WP-07 to WP-14 build what phase 0 rehearses. WP-15 can start at once, because its longest parts are outside the code. WP-17 is phase 0 itself.

#### WP-07 — The payment port and the membership ledger

| | |
|---|---|
| **Goal** | One provider-neutral place records a sale, a payment, a membership period and their reconciliation. A membership ends by date. A member has one live membership. No provider name appears outside an adapter |
| **Resolves** | BIL-06 (S1), BIL-05 (S1), BIL-09, BIL-08, BIL-07, and the provider-independent parts of BIL-01, BIL-02, BIL-04 and MAIN-20 (part 7). Part 4, items 2, 9 and 10 |
| **Touches** | A port with its module contract (R-19), in `packages/domain-membership-billing` or a new package. New records by migration: the sale (what was offered and accepted), the payment, the receipt reference, ledger entries in whole minor units, the reconciliation match, the membership period. `packages/database/src/schema/subscriptions.ts`, `billing.ts`, `membership-plans.ts`. The Paddle code moves behind the adapter boundary without a change of behaviour |
| **Effort, risk** | L. High: money and entitlement. Tier T5, with the reviews of R-02. The design comes first |
| **Needs first** | WP-02, WP-04. The exchange-rate rule is decided: the latest weekly NBRM rate in force at the moment of the sale |
| **Done when** | (1) A membership whose end date has passed grants no access, proven on a real database for a membership that never had a provider event. (2) A second live membership for the same member is refused by a database constraint. (3) **Every active membership meets the eligibility test of its kind** (the three tests are below the table); one daily query per kind lists the memberships that fail it, and each returns zero. An approved company term without a verified payment activates nobody: a negative test proves it. (4) Every sale stores the entity of record, the version of the terms, the price, the currency, the rate, the date of the rate and the amount in MKD; the rate is the latest stored weekly rate in force at the moment of the sale. (5) No file outside the adapter path imports a provider module (CHK-18: today's files are the baseline) |

**The eligibility test, per kind of membership** (corrected after the independent review, comment R2a-C03; the first version let "an approved company term" stand in for a payment).

| Kind | A membership may be active only when all of these are stored | Why |
|---|---|---|
| Individual, new sale (cash, card, transfer) | a payment of the sale's amount, **verified** by staff (cash: by a person other than its recorder) or confirmed by the adapter's applied event (card) | Business owner, 1.4c; suspension trigger (c) |
| Company employee, new | (1) the company's payment for the contract year, **verified** by staff against the invoice and its payment reference; **and** (2) the employee on the list that the company approved and staff verified, within the contract's seat count | Business owner, 1.4b: "Stafi verifikon pagesën dhe listën para aktivizimit" (`inputs/business-owner-decisions-2026-11-15.md:16`; `inputs/R2-owner-input.md:159`). Today an approval may carry no invoice reference, and provisioning writes `active` without payment evidence (`packages/domain-membership-billing/src/sponsors/decisions.ts:32-35,85-94`; `sponsors/provisioning-effects.ts:71-91`) |
| Imported existing member | an import record from a list that the entity administrator approved, with the proving reference of the entitlement paid before the import (invoice or receipt) **and** the preserved end date; no charge and no payment row is created | Business owner, 1.7 and 1.7b |

The same three tests are the detection of suspension trigger (c) (part 6.4): a membership that is active and fails the test of its kind is an activation without a verified payment.

#### WP-08 — The three pilot channels on the port

| | |
|---|---|
| **Goal** | Cash at the office; a company invoice paid by a referenced bank transfer; a one-time card payment through the entity's bank |
| **Resolves** | The payment channels of your input (§3) and the business owner's cash rules. The data for suspension trigger (b) |
| **Touches** | **Cash:** the states paid, held by the collector, handed over, deposited, reconciled; numbered receipts; one account per collector; a daily close. The staff verification moves from `apps/web/src/features/admin/verification/server/mutations/verify-attempt.ts` into the port's command (R-16). **Company:** a numbered invoice with a unique payment reference; matching against the bank statement. **Card:** the adapter boundary only (redirect to the bank's page, and the handling of its answer under R-07 with a sequence test); it is filled in when the bank answers. **Price:** the amount in MKD from the latest stored weekly NBRM rate in force at the moment of the sale; the sale stores the rate, the rate's date and the MKD amount; the rate is fetched outside the sale request, and a sale is refused when the stored rate is older than the allowed age |
| **Effort, risk** | L. High: money, and fiscal rules that are outside the repository |
| **Needs first** | WP-07. From the business: the accountant's determination of the fiscal document per channel; the bank's written approval of one-time online card payments in MKD, **which is required before the opening** (gate line 17), and the bank's test environment for the card rehearsal, which is a gate of its own before the first card payment (your answer of 2026-11-23). Card payments by members may start later than the opening; the approval may not |
| **Done when** | One journey test per channel on a real database: sale, payment, verification, activation, reconciliation; for the card channel, at the card gate before the first card payment (your answer of 2026-11-23). A cash payment cannot activate a membership before staff verify it, and its recorder cannot verify it. The daily close lists every payment that is not reconciled |

#### WP-09 — Import of existing members and the company roster

| | |
|---|---|
| **Goal** | Staff upload the business's sheets, the entity administrator approves each list, and only active memberships are registered: with their remaining period, without a charge |
| **Resolves** | The import requirements of your input (§3). The retirement of the older agent import. **The end of a company agreement**, which your input makes a precondition of importing real members (`inputs/R2-owner-input.md:125-129`) |
| **Touches** | `packages/domain-membership-billing/src/sponsors/` and `apps/web/src/features/sponsors/`: a preview with an error per row; duplicates within a list and across the lists before anything is written; one idempotency key per upload; grouping by company agreement or by source (the broker is a source, not an agreement); an imported end date; a proof reference and no financial history. Reading a spreadsheet file needs a parser, which is a new dependency: decided in the module contract; the file is read in memory and never stored, as today. `apps/web/src/lib/actions/agent/register-member.core.ts` is retired. What a company's contact may see of its employees is an owner decision that exists only in a memory note (question 27a): the roster and the invoice, nothing of a case |
| **Effort, risk** | L. High for data: real personal data from the first day. **The cap is settled and is not a question:** at most 500 memberships per company contract per year, and uploads one after another never raise it (business owner, 1.4b). The broker's list of about 1,000 is a source, not a company contract: its members hold individual memberships and the contract cap does not apply to it. How many rows one upload may carry (500 today, `roster-upload.ts:32`) is an implementation choice and is kept apart from the cap |
| **Needs first** | WP-07 (the period, the eligibility tests), WP-13 (stored acceptance at activation). From the business: the column layout of the sheets and the approved lists; and the rule for the end of a company agreement (owner check 22) |
| **Done when** | **Import.** Uploading the same sheet twice writes nothing the second time. A faulty row is shown before anything is written. A person who appears in two lists is reported before anything is written. Every imported membership has its end date and its proof reference, and ends on that date. **Cap.** A test uploads lists one after another for one contract year, before and after the approval of the term, and at no point are more memberships provisioned than the approved seat count, which is at most 500; the upload that would cross it is refused as a whole and writes nothing. **End of a company agreement**, proven before the first real company list is imported: after a termination with an effective date, (1) no employee can be added or activated under that agreement from that date, by a test; (2) every employee membership that was paid ends exactly when the stated rule says, by a test on a real database with one employee per case — the standard rule is that a paid membership stays active until its paid-through date and is never shortened (business owner, standard rule and 90-day clause); today's code ends the cover at the effective date (`packages/domain-membership-billing/src/sponsor-coverage/evaluate.ts:60,76`), so the code is changed to the rule you confirmed on 2026-11-17 (answer 22): a paid membership runs to its paid-through date; (3) each affected employee receives exactly one notice through the delivery record; (4) the termination, its actor and its date are in the audit trail; (5) an employee who leaves the list is treated by the same stated rule. All of it rehearsed in phase 0 with synthetic sheets in the real column layout |

**Which path fits** (you asked). The roster import is the right skeleton for both the company lists and the broker's list, once the gaps above are closed; no second import is needed. The agent-assisted sale stays for new cash sales (WP-08). The older agent group import is a duplicate with other behaviour and is retired.

#### WP-10 — The controls of a closed pilot

| | |
|---|---|
| **Goal** | Phase 1 is by invitation: nobody creates an account, submits an intake or starts a purchase without one, whether through a screen or by calling the server directly. New sales can be stopped at once without stopping service. The three suspension triggers can be detected |
| **Resolves** | The switches and triggers of your input (§3, §3a); MAIN-21 for phase 1; POPS-07 and POPS-08 by keeping recovery dark; TEN-02; the provisioning of roles |
| **Touches** | Server code only; the proxy is not involved, because it does not see `/api` and a server action can be called without its page. **(1) Registration closed by configuration.** In the phase 1 configuration the identity library is built with sign-up off for both mechanisms it enables today — password sign-up and sign-in by e-mailed code — and with no social provider (`apps/web/src/lib/auth/providers.ts:42-44,72-86,36-40`). The installed library has both options (part 6.1a). Opening them again needs a deployment. **(2) One runtime setting per tenant, with two keys**, on the pattern that exists (`tenant_settings`, read as in `apps/web/src/features/sponsors/data.core.ts:61-76`, closed when the row is absent): `public intake` and `new sales`. Every public entry of part 6.1a asks the first: the Free Start intake and the claim pack, the company-interest form, the pricing page, and the two guards that run before the identity library (`apps/web/src/app/api/auth/[...all]/route.ts:133-145` and the neutral code route), so that from phase 2 a suspension can also stop sign-up without a deployment. Every sale path asks the second: the start of a lead payment, the conversion, the agent's sale, the provisioning of roster entries, the card checkout. Sign-in, activation by link, password reset, claims, messages and the expiry notice ask neither. **(3) The registry of public entry points** (CHK-26). **(4) Switches** for recovery, AI reading and injury cases. **An allow-list of roles per tenant.** **Detection:** part 6.4 |
| **Effort, risk** | M. High: authentication configuration and sale paths (tier T5). No proxy change |
| **Needs first** | WP-01 (the four unguarded exports are gone); WP-02, so that a refusal is recorded in one place; WP-07 for triggers (b) and (c) |
| **Done when** | Each line is a test on the release candidate, with the settings as in phase 1. **Closed:** (1) a direct `POST /api/auth/sign-up/email` with a well-formed body is refused, and no user row is written; (2) a code requested for an unknown address is answered exactly like one for a known address, no code is stored or sent, and a verify for an unknown address is refused and writes no user row; (3) the production configuration holds no social provider, and the two variables that would add one are refused at start; (4) a direct call of the Free Start intake action and of the claim-pack action is refused and writes nothing, and the home page renders no intake; (5) a direct call of the company-interest action is refused and writes no lead (the form is closed in phase 1 by your answer 6; companies come by invitation); (6) the pricing page offers no purchase and no code step. **Kept:** (7) an imported member requests the activation link, sets a password and signs in; an existing member signs in by password; a password reset works; a member submits a claim; staff reply; the opt-out link of a roster, the tracking link of a claim and a share pack work. **Sales:** (8) with `new sales` off, each sale path refuses on the server, by a test per path, while everything of line 7 still works. **Registry:** (9) CHK-26 finds no public entry outside the registry. Its static closure predicate (unit U2) follows the opening (your answer of 2026-11-23); until it lands, the registry check and the tests of lines (1) to (6) prove that each closed entry stays closed. **Triggers:** each fires on a seeded case in the phase 0 rehearsal. No user row carries the mark "classification pending" at the opening, by a query (MAIN-21). Only the five pilot roles can be granted in the pilot tenant. The E2E endpoint cannot be switched on in production: today it opens whenever its secret is set, whatever the environment (`apps/web/src/app/api/e2e/branches/route.ts:18-43`), so production refuses the secret and the automation variables at start, and this test runs with them set (review comment R2b-C02); the test activation of billing already refuses a production deployment in code (`apps/web/src/lib/runtime-environment.ts:31-39`), and a test keeps that |

`NEXT_PUBLIC_PILOT_MODE` is not such a control. It is read once, in a client component (`apps/web/src/components/pricing/pricing-table/index.tsx:41`): it disables buttons and hides one link. No route, action or handler reads it. Nor is the property `publicEntryEnabled` of the Free Start shell: the intake renders whatever its value.

#### WP-11 — Claim rules and notifications in the shared command; a delivery record

| | |
|---|---|
| **Goal** | Every entry point to a status or an assignment behaves the same. Staff are told when a member needs an answer. Every notification has a stored result and is in the recipient's language |
| **Resolves** | CASE-03 (S1), CASE-04, CASE-11, CASE-02, CASE-06, CASE-07, SCTX-03, part of MAIN-07, SCTX-17 (the ops center shows the raw error text and stack in the browser) and SCTX-11 (three staff read models answer a failure and a refusal with the same empty result; the rebuilt staff screens read through R-08) |
| **Touches** | The status and assignment writers of `packages/domain-claims` (R1 counted 69 non-test files in the claims package) and `apps/web/src/features/admin/claims/actions/`; the five entry points that nothing renders are removed. The senders of `packages/domain-communications`: eight call sites, 18 templates, one column for the recipient's locale. A delivery record on the model of `sponsor_mail_outbox` (state, attempts, last error). A notification to staff for a new claim and for a member's message. The time of each request and of the first staff answer |
| **Effort, risk** | L. Medium. Tier T5: it changes the preconditions and the effects of status changes, which rule R-04 places in T5 whatever the path (corrected from T4; review comment R2a-C12) |
| **Needs first** | WP-02 |
| **Done when** | A contract test changes a status through every entry point and finds the same effects: history, event, notification. The admin path asks for a decline reason. A member's message produces a notification to staff. A failed send is stored with its cause and appears in a list. An e-mail to a member whose locale is `mk` is in Macedonian, by a test per template. The share of requests answered by the end of the next working day can be computed from stored times |

#### WP-12 — Case fields for scope B, and the correspondence register

| | |
|---|---|
| **Goal** | Staff record what they need to follow a Green Card case, and every exchange with an insurer or a bureau. The platform decides neither coverage nor compensation |
| **Resolves** | Case scope B (§3a); business rule 4; the feature of recipe 2 (R2b) |
| **Touches** | `packages/database/src/schema/claim-core.ts`. Present: the country of the accident and the reference. New: the country of registration of the other vehicle, the proof of insurance, the outside handling party, the coverage-verification status, the follow-up date. **A new register**: who sent, under what authorization, which documents were shared, what was answered, when to follow up. It is written under the feature protocol: module contract first. Reuse: `share_packs` for the list of shared documents, the document category `correspondence`, the due date pattern of `claim_information_requests`. A switch for injury cases |
| **Effort, risk** | M. Medium: new tables, each with its tenant policy and a real-database test (R-06) |
| **Needs first** | WP-02, WP-05; your answers to question 31, given on 2026-11-17 and written into the module contract. The plan is `FEATURE-RECIPES.md`, as corrected in R3 and again after its drill: 18 files written, 13 edited, 8 of the 13 only because no extension point exists; a second table holds the authorities of a case (approved by you on 2026-11-17, question 37), because a basis that can be revoked must be stored where the revocation can be read (three of the four kinds have no table today); a unique key on the share-pack table comes first, because the register's tenant-bound reference to a pack needs it; the share pack is built before the command's transaction, not inside it (R-17) |
| **Done when** | In phase 0, one new Green Card case under Skopje's mandate is followed by hand from intake to the last follow-up: the business owner's own proof. An outside party never becomes a platform user. A follow-up date that has passed appears in a staff list. **Acceptance criteria added in the closing pass** (review comments R3-C03 and R3-C04; your answers 34, 37 and 38; the quotations are from the English requirements baseline, read by the main session): **(a) Record and revoke.** The recording of an outbound record and the revocation of an authority use one synchronization that WP-12 defines: both commands take the same lock in the same order, or another protocol that is shown to work. The moment at which the authorization is decided is named, and scope and expiry are checked again at that moment. A test on two connections shows both orders: a revocation that commits first refuses the record; a record that commits first stays, and the revocation holds for the next one. The baseline asks for this evidence: "Revoked or expired authority shall immediately block new representation actions while preserving historical evidence and permitted closeout work", with the acceptance clause "Automated evidence demonstrates the stated behavior for authorized, denied, malformed, boundary, and retry/concurrency cases relevant to revocation" (IDA-REC-005). **(b) What an action needs.** The four values classify the evidence; one value does not by itself authorize an action. For each outward action that the pilot supports, WP-12 lists the bases that must hold together, with their scope and jurisdiction, and the recording command checks that list. From the baseline: representation needs "an active, case-specific, jurisdiction-appropriate power of attorney or equivalent authority" (IDA-REC-004); "Service 2 shall not contact an insurer, authority, lawyer, expert, or counterparty on behalf of the user without the separately required agreement and authority" (IDA-SVC-014); external sharing needs "the applicable versioned consent or lawful-basis evidence" (IDA-DOC-012). Professional recovery ("shall not start until the applicable recovery agreement is accepted and versioned", IDA-REC-003) and VONESA ("Accepted fee disclosure plus signed assignment or valid POA", PRC-32) are outside the pilot by the business owner's decision; this list makes neither a pilot requirement: the enumeration holds their values, and no action of the pilot uses them. **(c)** A branch manager sees the number of the register's records and their dates, no content (your answer 38). **(d)** Injury cases are off at the opening unless their medical approvals arrive before it (your answer 34): the switch is set so, and its denied case is tested |

#### WP-13 — Privacy: stored consent, the procedure for deletion and export, retention

| | |
|---|---|
| **Goal** | Import and activation rest on a stored acceptance. A request of a person about their data can be served |
| **Resolves** | POPS-05, POPS-01, POPS-02, POPS-06, TEST-08 |
| **Touches** | The activation flow stores the acceptance of the privacy notice and of the terms, with version and time (part 4, item 2); today the link is the ordinary password-reset link and stores none (`apps/web/src/lib/member-activation-invite.ts:17-31`). A written procedure for deletion and export, rehearsed once on a copy that is not production. A retention table per document type |
| **Effort, risk** | M: one flow, and procedures. Medium: the content is legal |
| **Needs first** | From the business: the retention periods in writing, from the lawyer and the accountant; the text of the privacy notice |
| **Done when** | Every activated account has a stored acceptance, by a test. A record exists of one rehearsed deletion and one rehearsed export. The retention table is signed. The software for these requests (WP-13b-1) follows the opening (your answer of 2026-11-23); until it lands, the written, rehearsed procedure serves every request |

#### WP-14 — The member-relationship minimum, and declared scheduled work

| | |
|---|---|
| **Goal** | One notice a month before a membership ends, for every membership. Service notifications with a stored result. One contact per company agreement. Marketing consent apart from service messages |
| **Resolves** | The phase-1 minimum of your input (§3); MAIN-11, SCTX-09, SCTX-07, SCTX-13, SCTX-10; rule R-11 |
| **Touches** | The 30-day notice and its outbox are widened from sponsored members to every membership period of WP-07 (`packages/domain-membership-billing/src/sponsors/mail-producers.ts:40-55`). The outbox is the delivery record of rule R-11: queued, claimed under a lease, sent, skipped or failed, with attempts and a backoff (`packages/database/src/schema/sponsor-roster.ts:121-168`). A registry of scheduled work and the delivery contract tests (CHK-11, both parts). One mechanism per job; the second engagement-mail path stays off. One contact per company agreement and a separate marketing consent exist already |
| **Effort, risk** | M. Low to medium |
| **Needs first** | WP-07, WP-11 (the delivery record), WP-15 (the scheduler of the new production) |
| **Done when** | A membership that ends in 30 days gets one notice, with the end date and how to renew. The four cases of the delivery contract pass on a real database for the notice job (corrected after the independent review, comment R2a-C09; the first version tested only a second run): (1) a run that stops after it claimed an item and before it sent delivers that item once the lease has expired; (2) a failed send is stored with its error code, is retried later, and after the attempt limit is marked failed and appears in the staff list; (3) a second run after a finished run sends nothing, and a second enqueue for the same membership and period creates no second item; (4) two runs at the same time claim disjoint items. What is not promised: a run that stops after the mail provider accepted the message and before the record was finished sends that one notice twice. Every scheduled job is in the registry with its schedule and its last success. No job answers success after an item failed without recording the cause |

#### WP-15 — The first production setup

| | |
|---|---|
| **Goal** | A new project that is clean from the start, and that can be restored and reverted |
| **Resolves** | MAIN-14, DATA-03, POPS-03, POPS-04, MAIN-05, TEN-01, TEN-02, SEC-03, SEC-05, SEC-08, MAIN-13, SEC-12, SEC-13, and the limits and the rehearsal of DATA-13 |
| **Touches** | Mostly operations: `.github/workflows/cd.yml` (one migration step before the alias moves; your approval), runbooks, an environment schema. The full list is part 8; for the database it is `DB-BASELINE.md`: the Data API off and the privileges of its roles revoked, time limits on the application's database roles, run-time connections on the transaction pooler, the server certificate verified, storage without policies for a provider session, one build path |
| **Effort, risk** | L in elapsed time. High |
| **Needs first** | WP-04. The decision on the repository's visibility. The provider's backup plan |
| **Done when** | Every line of part 8 has its record |

#### WP-16 — Tests that prove the pilot journeys

| | |
|---|---|
| **Goal** | What the pilot depends on is executed by a workflow, and can fail for the right reason |
| **Resolves** | TEST-01, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, and TEST-02 and BIL-14 in their provider-independent form |
| **Touches** | `.github/workflows/ci.yml`: 124 of 148 database test files run in no workflow. A list of lanes and exclusions (CHK-14). Real-database tests for branch and role denials. One journey test per payment channel; one sequence test per adapter (CHK-07) |
| **Effort, risk** | M. Medium: the added CI time is measured in a trial before a check becomes required (R-10) |
| **Needs first** | The lane wiring can start at once. The journey tests follow WP-07 to WP-12 |
| **Done when** | No test file is outside every lane unless it is listed with a reason. The five pilot roles have an allow-and-deny matrix on a real database; once you confirm them (question 27), it holds two lines that today live only in memory notes: a company's contact reads no claim, document, message or usage of an employee, and staff read no draft of a member. One executed test per channel drives a payment to an entitlement |

#### WP-17 — Phase 0: the rehearsal

| | |
|---|---|
| **Goal** | Every journey once on staging with synthetic data. The restore and the release rehearsed |
| **Resolves** | The gate to phase 1 (part 6) |
| **Touches** | Staging. The staging acceptance guide (`docs/guides/staging-staff-member-admin-acceptance.md`) is replaced by the rehearsal procedure, or updated to it |
| **Effort, risk** | M, in people's time. Medium |
| **Needs first** | WP-07 to WP-16 |
| **Done when** | A record exists for each journey, for the restore drill with its measured recovery point and time, and for the release with one revert. One run with concurrent sessions on the pilot journeys in which no function reaches its time limit (`DB-BASELINE.md`, DB-19). Upload and download of a document with the Data API off and without storage policies (DB-24). **Performance** (your answer of 2026-11-23: "yes"): one repeatable rehearsal on production-like settings, with both tenants, representative roles, a mobile profile and a consistent 4G profile, replays the 13-session workload and the recovery from a failed upload. On a small fixed set of critical journeys, the 75th percentile per journey is at most 0.8 s for TTFB, 2.5 s for LCP, 200 ms for a scripted interaction and 1.5 s for a key action, each with its sample count. Every expected action completes, with zero hung requests and zero function timeouts. Real-user metrics are collected from the launch |

#### WP-18 — The pilot screens on the new interface

| | |
|---|---|
| **Goal** | The screens of the pilot path on concept A, under the screen contract (R-23) |
| **Resolves** | Your decision to rebuild the interface (§1b). It also moves the server actions behind those screens onto the wrapper (WP-02) |
| **Touches** | New screens for what does not exist today: the import with its preview, cash recording and the daily close, the company invoice, the correspondence register, activation with acceptance. Then the existing screens of the pilot path |
| **Effort, risk** | XL. Medium |
| **Needs first** | WP-05, WP-02. The order is decided (your answer 2) |
| **Done when** | Every rebuilt screen passes the checks of the contract and its end-to-end journey. The `page-ready` markers and the canonical routes are kept |

**The order, as you decided it on 2026-11-16.** Build the new pilot screens new: they have no predecessor. Rebuild the member's screens next, because members see them from the first day. Let staff and administrator screens follow during phase 1. The pilot does not wait for the full rebuild: its three success criteria do not depend on the visual design, and real personal data makes correctness the first need. The cost of this order is a mixed interface for staff during phase 1.

#### WP-19 — The one entry door: the new production opens on `ida.*`

| | |
|---|---|
| **Goal** | One door per environment. The new production serves on `ida.*` from its first day (your decision of 2026-11-16; ADR-12, accepted 2026-11-11). A country host only redirects, or does not exist in the new project. Nothing takes authority from a host name |
| **Resolves** | Part 4, item 6, and the part of item 7 that the first entity needs. Part of TEN-05 (three generations of tenant entry) |
| **Touches** | The steps that ADR-12 lists as open (`docs/architecture/adr-12-one-entry-door.md:195-205`, read by the main session as evidence). **Dependencies:** the two admin evidence-upload paths and the ownership of an anonymous lead, which still take a tenant from the host (`:65-67`). **Destinations:** generated links, e-mail flows, callbacks and the address a payment returns to. **Admission:** the proxy admits the one configured door; an alias redirects on GET and refuses every other method, and that rule must reach `/api` and static paths, which the matcher excludes today (`:63`; `apps/web/src/proxy.ts:8-10`). **Tests:** the E2E projects and their stored sessions are built on the country hosts and underpin required gates (`:175-185`); they move to the door with sessions created by a real sign-in on it. The flag `FEATURE_IDA_LIVE_LOGIN_CUTOVER` and `IDA_HOST` enter the environment schema of WP-15: the flag is in no environment example and no workflow today |
| **Effort, risk** | L, and `NOT MEASURED`: ADR-12 names the steps, not their size. High: proxy and authentication (tier T5); every proxy change needs your approval, one at a time (R-34); the required E2E gates depend on the hosts that are being replaced |
| **Needs first** | WP-02 (a refusal is recorded in one place), WP-10 (the closed public paths are specified for the door). Your approval for each proxy change |
| **Done when** | In phase 0 on staging: every pilot journey of the five roles runs on the one door, with sessions created by sign-in on that door. Only the door is attached to the new staging and the new production: no country host exists there, and you check the attached domains before a project holds data. Every link and e-mail produced in the rehearsal points at the door. Each gate journey that ran on a country host is listed with its replacement. **After the opening** (your answer of 2026-11-23): the alias redirects — a request on a country host changes nothing on the server, a GET is redirected and any other method is refused, by tests that include `/api` — and the move of the E2E projects and their stored sessions to the door. The production environment names exactly one host, and that host is the whole list of trusted sign-in hosts of production (SEC-11; the mechanism is WP-01) |

### Group 3 — later (provisional; run B completes it)

| Item | What brings it forward |
|---|---|
| Open online in North Macedonia (phase 2) | The gate of part 6 |
| Partner access: scoped, revocable grants with two-step verification and an expiry (business rule 3; recipe 1) | After the pilot. The grant table exists and has no production writer (TEN-03, CASE-10) |
| The next entity: host and tenant from the registry (part 4, item 7); activation by the operator (recipe 3) | At least six months of production in Skopje |
| Diaspora: two tariffs per entity, declared origin and residence | After the pilot. SRS §21 was not read in R1 |
| Automatic card renewal: stored card, charges started by the merchant, retries, dunning | A later capability of the port |
| The Paddle adapter and every Paddle-specific finding (part 7) | Only if Paddle is chosen |
| Settlement between entities (part 9) | The second entity |
| Professional recovery with a success fee; advances outside the membership | After the pilot. A flow of its own, apart from the membership port (business rule 5) |
| Member-relationship features: segments, campaigns, NPS, win-back, referrals, company reporting | After run B has reviewed the packages |
| Diagnosis: structured logs and error context (SCTX-05, SCTX-06) | Before phase 2. The conflict that the first version left open is settled (R2b, read by the main session): SCTX-05 holds. The capture sites pass the tenant and the claim, and the scrubber, installed before every send on server, edge and browser, deletes them (`apps/web/src/lib/observability/sentry-privacy.ts:243-249`; `apps/web/src/sentry.server.config.ts:31-32`). An error record that arrives names no tenant, no user and no case; the R2a pass had read the capture call, not what leaves |
| Branch scoping (CASE-01, CASE-05, CASE-08, CASE-09) | A second branch |
| Audit authority and immutable audit rows (DATA-06, CASE-12; part 4, item 5) | Run B |
| Unlimited list reads and the message poll (DATA-07, DATA-08); inline-script policy (SEC-07) | Before phase 2; measured by run C's load measurement, in phase 0 (your answer of 2026-11-23) |
| The remaining server actions onto the wrapper (WP-02) | With each rebuilt screen |
| AI reading of documents (POPS-09) | After the pilot |

**Findings without a package.** Fourteen active findings, all S2 or S3, are tied to no package above: DATA-09 and DUP-01 (double declarations), DUP-05 and DUP-06 (two role predicates; four pagination conventions), DUP-08, DUP-09 and DUP-11 (copies), MAIN-08 (the size of feature PRs, watched by `EFFECT-CHECK.md`), MAIN-10 and MAIN-18 (tools and scripts that nothing uses), MAIN-12 (declared against resolved versions; the local database is a major version away from CI's), SEC-09 (dead entry points in the server surface), TEN-04 (what the two tenant guards cannot see; WP-16 adds the tests that can) and TEST-09 (the 300-line limit on test files). Each gets its row and its decision in the technical-debt register (R2b).

## 6. The pilot: phases, gates, criteria, triggers

### 6.1 The three phases

| Phase | What it is | Gate to enter |
|---|---|---|
| **0. Rehearsal** | On staging, with synthetic data. Staff and agents run every journey: the import of a sheet, a cash sale, a company invoice, case intake. The card rehearsal, **a card payment in the bank's test environment**, is required, not conditional (your answer of 2026-11-16; business owner, gate list); it is a gate of its own before the first card payment, not a part of phase 0 (your answer of 2026-11-23): if the bank offers no test environment, no card payment is taken and the matter returns to you. The load measurement of run C runs in phase 0 (your answer of 2026-11-23). The restore drill and the release rehearsal run here, and every journey runs on the one door (WP-19) | WP-01 to WP-05 merged. WP-07 to WP-14, WP-16 and WP-19 on staging |
| **1. Closed pilot** | In the new production, by invitation. The imported members, one or two company agreements, staff and agents. Public registration and Free Start stay off. Cash and company invoices first, then card for a few. 90 days from the official opening; a check on day 30; the CEO decides at the end | Part 6.2 |
| **2. Open online in North Macedonia** | Public registration and public sale | Part 6.5 |

### 6.1a Public entry points, and what closes each in phase 1

**This section replaces the first version, which was wrong** (independent review, comment R2a-C01). The first version said that Free Start had "no page and no route, only validators" and that it "stays off". It is on: the home page mounts it for every visitor, and its server action accepts a caller without a session. It also did not list the ways to create an account without an invitation. The cause: the row came from a fact-finding unit, and the main session had re-read only the first row of that unit's table.

**How this version was built.** A new unit listed every page, route handler and server action that a caller without a session can reach, from the mounting chains and from the enabled configuration, not from names (`A/raw/R2b/entry/public-entry-inventory.md`; Opus 5.5). **The main session then re-read, at the pinned commit, the lines behind every row below that says "closed", "kept" or "none"**, and the lines of the installed identity library (`better-auth` 1.6.33) behind the two switches (`A/PROGRESS.md` §33). One row is marked where it rests on the unit alone.

**A. Creating an account or a session without an invitation**

| Entry | Today | A switch on the server today | In phase 1 |
|---|---|---|---|
| Password sign-up, `POST /api/auth/sign-up/email` | Open to a direct call. The guard before the library tests the tenant context of the request, not an invitation (`apps/web/src/app/api/auth/[...all]/route.ts:133-145`; `sign-up-tenant-guard.ts:22-38`). No screen offers it: `/register` redirects to the pricing page | None | **Closed** by the library option for password sign-up; the library then refuses before it reads the body (`better-auth` 1.6.33, `dist/api/routes/sign-up.mjs:144`). Sign-in and password reset are not touched by that option |
| Sign-in by e-mailed code on the neutral door: `POST /api/auth/email-otp/send-verification-otp`, then `POST /api/auth/sign-in/email-otp` | **Creates the account when the address is unknown** (`apps/web/src/lib/auth/providers.ts:72-86`, `disableSignUp: false`; library `dist/plugins/email-otp/routes.mjs:410-430`). Offered on the home page (Free Start, "save"), on the pricing page before checkout, and on the sign-in page. Accepted only on the `ida.*` host or the configured door (`neutral-otp-boundary.ts:54-67`) — which is where the new production opens | None | **Closed** by the same option of the code plugin: an unknown address gets the same answer and no mail (`routes.mjs:102-106`), and a verify for an unknown address is refused (`:411-412`). A known address is still served by the library; whether an imported member's code sign-in passes the door's own session check is `UNVERIFIED` (the unit infers that it does not, `neutral-otp-session.ts:79-86`), so password sign-in is the path that phase 1 relies on |
| GitHub sign-in, `POST /api/auth/sign-in/social` and its callback | Exists only when two variables are set (`providers.ts:36-40,89-95`) | The two variables | **Closed**: the environment schema of the new production refuses both variables (part 8, line 8) |
| Password reset, `POST /api/auth/request-password-reset` and `/reset-password` | Open; creates no account | — | **Kept.** It is the activation of an imported or staff-created member: the invitation is this link (`apps/web/src/lib/member-activation-invite.ts:17-31`). There is no invitation record of its own. The request lets the caller name where the link ends, among the trusted hosts; WP-01 restricts that to the door itself (SEC-11) |
| Sign-in by password, `POST /api/auth/sign-in/email` | Open; existing accounts only | — | **Kept**; its limits are part of WP-15 |
| Accounts created by server code: the agent's sale, the conversion of a lead, the provisioning of a roster, the reconciliation of a checkout | Four direct inserts; none goes through the sign-up endpoint (`apps/web/src/lib/actions/agent/register-member.core.ts:95`; `packages/domain-leads/src/convert.ts:123`; `packages/domain-membership-billing/src/sponsors/provisioning-identity.ts:163`; `…/paddle-webhooks/handlers/utils/reconcile-checkout-user.ts:144`) | A session with a role; the roster path also the per-tenant import setting | **Kept**, behind the setting `new sales`. Closing sign-up does not break them |

**B. Free Start**

| Entry | Today | A switch today | In phase 1 |
|---|---|---|---|
| The intake on the home page | Mounted for every visitor (`apps/web/src/app/[locale]/page.tsx:55-60`; `…/components/home/home-page-runtime.tsx:184-194,210-220`) | None; the property `publicEntryEnabled` is not one | Not rendered |
| The intake action `submitFreeStartIntake` | A caller without a session; one idempotency row; 10 calls in 10 minutes per caller (`apps/web/src/actions/free-start.core.ts:9-18`; `free-start/submit.core.ts:46-73`) | None | **Refused on the server** by the setting `public intake`; a direct call writes nothing |
| The claim-pack action `generateClaimPackAction` | A caller without a session; writes nothing; the same limit (`apps/web/src/actions/claim-pack.core.ts:101-111,145`) | None | Refused with it |
| "Save": the account by code, and the drafts | The account as in part A; the drafts need a session and the default public tenant (`free-start-drafts/session.core.ts:60-88`) | None | Closed with the code sign-up of part A |

**C. Other public pages, forms and routes**

| Entry | Today | In phase 1 |
|---|---|---|
| Pricing page and its checkout | Plan buttons open the provider's overlay in the browser; before it, the code step of part A creates the account. `NEXT_PUBLIC_PILOT_MODE` disables the buttons in the browser only | **Closed**: no purchase and no code step are offered, by the setting `public intake`; the account path is closed in part A; the provider's webhook has no secret in the new production and refuses |
| The `/register` page | Redirects to the pricing page (`(auth)/register/_core.entry.tsx:10-26`) | Closed with it |
| `POST /api/register`, `POST /api/simple-register` | Answer 410 in code and write nothing | Stay closed |
| The company-interest form, `/business-membership` | A caller without a session stores a lead with a name, an e-mail address and a telephone number; 6 calls in 10 minutes per address (`apps/web/src/lib/actions/business-membership-lead.ts:104-175,213-235`) | **Closed in phase 1** by the setting `public intake` (your answer 6 of 2026-11-17: companies are onboarded by invitation) |
| The "call me now" action | A caller without a session stores a lead; **no rate limit**; the dialog that imports it is rendered nowhere (`apps/web/src/actions/leads.core.ts:21-45`) | Deleted in WP-01 (SEC-10) |
| The two thank-you letter actions | No session; nothing imports them (SEC-01) | Deleted in WP-01 |
| Help Now | Content in the browser; no server action (the unit's search; not re-read) | Stays open: safety guidance only |
| NPS survey, the opt-out link of a roster, a share pack, claim tracking | Each bound to a signed or stored token | Stay |
| The tenant-context route of the sign-in page | Sets a tenant cookie from the address line, without a session (`(auth)/login/tenant-context/route.ts:25-38`). No authority follows from that cookie (R1, A8) | Stays; WP-19 reviews it with the country hosts |
| `GET /api/health`, `POST /api/csp-report` | No session; the health answer carries build detail (SEC-09) | Stay; the health answer is trimmed with WP-15 |
| Webhooks, the job endpoint, the cron routes, the E2E and debug routes | A signature, a signing key, an authorization header. **The E2E helper route is closed by a secret, not by the environment** (corrected in R3, review comment R2b-C02): `/api/e2e/branches` answers 404 only while `E2E_API_SECRET` is unset; once it is set, a request that carries it reaches the mutation under `NODE_ENV=production` too (`apps/web/src/app/api/e2e/branches/route.ts:18-43`, re-read in R3). The debug routes: as the unit reported, not re-read | Not entries for people; listed in the registry with their authentication. WP-10 makes production refuse the E2E variables at start, and its test runs with the secret and the automation flags set |

**What is not protected by a layout.** No layout under `apps/web/src/app` checks a session (the unit's search over ten layouts). The portals are protected by the proxy alone: a request is "protected" when its first segment after the locale is `member`, `admin`, `staff` or `agent` (`apps/web/src/lib/proxy-resolve.ts:6-10,42`), and it is then sent to the sign-in page without a valid session (`proxy-gate.ts:111-123`). Every other page is public unless its own code refuses. That is rule R-34's reason, and it is why the closure above is in server actions and route handlers.

**Activation in phase 1** is by an e-mailed link that sets a password. The link is the ordinary password-reset link, and nothing records an invitation as such; WP-13 stores the acceptance at that step.

### 6.2 The gate to open phase 1

Nothing below is an approval to open. Each line names its proof. The software lines are met by the packages; the business lines are the business owner's own list (§3a, "to verify before opening"), kept as the business owner wrote them: lines 17 to 19 were corrected after the independent review (comment R2a-C04) and your answer of 2026-11-16, because the first version had moved the bank's approval behind the opening and had let the injury switch stand in for the company-membership approvals.

| # | Must be true | Proof | Closes |
|---|---|---|---|
| **Software** | | | |
| 1 | Both S0 findings are closed; production trusts no host but its own as the target of a sign-in or reset link; no pilot request opens a second database transaction inside the first | WP-01, with its tests; the list of trusted hosts read from the production configuration; the tenant and role tests on a pool of one connection | SEC-02, MAIN-15, SEC-11, DATA-13 |
| 2 | No access across tenants or roles | The allow-and-deny matrix of the five roles on the release candidate, on a real database under the restricted role | SEC-06, TEST-07 |
| 3 | A membership is active only when it meets the eligibility test of its kind — individual: a verified payment; company employee: the company's verified payment **and** the approved, verified list; imported: the approved import record with its proving reference and preserved end date — and it ends on its date | WP-07: the three tests, one daily query per kind that returns zero, a negative test for an approved company term without a payment, a real-database test of the end date | BIL-06, BIL-05 |
| 4 | Cash and company payments reconcile | WP-08: one journey test per channel; a daily close | — |
| 5 | The import is proven on synthetic sheets in the real layout | WP-09, in the rehearsal record | — |
| 6 | Nobody without an invitation can create an account, submit an intake or start a purchase, through a screen or by a direct call; new sales can be stopped while service continues; the three triggers fire on seeded cases | WP-10: the nine tests of its completion line; CHK-26 | TEN-02, POPS-07, POPS-08, MAIN-21, SEC-10 |
| 7 | Members and staff are notified, in the recipient's language, with a stored result | WP-11 | CASE-03, CASE-02, CASE-06, CASE-07, SCTX-03 |
| 8 | Acceptance of the terms and the privacy notice is stored at activation | WP-13 | POPS-05 |
| 9 | The one-month notice is sent once, and its job is scheduled | WP-14 | MAIN-11 |
| 10 | No destructive script exists outside the guarded path, and the guard accepts only a loopback database and the CI container; schema changes travel one road | WP-04: the refusal tests (an arbitrary remote target, staging, an unknown project), the deleted scripts, the deleted push commands | DATA-04, DATA-05, DATA-02 |
| **Operations** | | | |
| 11 | The first production setup is complete | Part 8, line by line | MAIN-14, DATA-03, POPS-03, POPS-04, MAIN-05, TEN-01 |
| 12 | Procedures exist and were rehearsed: deletion and export; the daily cash close; staff hours and substitutes; who owns an incident | The rehearsal records | POPS-01, POPS-02, POPS-06 |
| 13 | Every journey ran in phase 0 | WP-17 | — |
| **Business** | | | |
| 14 | The lawyer's written opinion on the membership model | The opinion, before the first payment | — |
| 15 | Client terms, privacy notice, and retention periods per document type in writing | The signed texts | POPS-06 |
| 16 | The fiscal document for each payment channel | The accountant's determination | — |
| 17 | The bank's written approval of one-time online card payments in MKD, **before the opening**. The card journey rehearsed in the bank's test environment is a gate of its own, before the first card payment, not a condition of the opening (your answer of 2026-11-23). Card payments by members may begin later than the opening; that does not change the approval | The bank's letter; the card rehearsal record, before the first card payment | — |
| 18 | The approvals for company memberships, with consent, revocation and reporting. **Unconditional:** nothing replaces them | The approvals | — |
| 19 | The approvals for medical data, with consent for the specific purpose, revocation and reporting — or injury cases stay switched off on the platform. This is the only line that a switch can satisfy | The approvals, or the switch of WP-12 set to off and a test that an injury case cannot be opened | — |
| 20 | The columns and duplicates of the lists are verified, and each list is approved by the entity administrator | The approval record per list | — |
| 21 | The four proofs of the business owner: activation only after payment; the one-month notice; reconciliation of the three channels, shown for cash and company invoices at the opening and for the card channel at the card gate (your answer of 2026-11-23); one new Green Card case followed by hand under Skopje's mandate | The rehearsal record | — |
| 22 | The repository is private: after a dated cost and capability check (Actions minutes, private-repository rulesets, CodeQL, Sonar), before the earlier of the pilot opening or the first import of real member data (your decision 6 of 2026-11-18). A cost problem waives neither R-10 nor this line. No signed evidence and no export has entered the repository since 2026-11-16, and privacy never permits a personal document in it; the ten scans are out of the tree together with the change of the release-evidence check; the people on the published scans are informed; the lawyer has seen the disclosure. Rewriting history for the scans stays a separate decision | The dated check; the repository setting with its date; the merged PR; the record | MAIN-15 |
| **Release evidence** | | | |
| 23 | The release record names the deployed commit; that commit has its review record; a signed approval names the tenant, the country, the offer and the scope | The three records | MAIN-09, MAIN-05 |

### 6.3 The success criteria, and what must exist to measure them

| Criterion (90 days) | What must be stored | Package |
|---|---|---|
| 50 new paid memberships, individual and company, imports not counted | For each membership: whether it came from the import or from a sale | WP-07, WP-09 |
| At least 90% of requests answered by staff by the end of the next working day | For each request: the time it arrived and the time of the first staff answer; the working days and hours of Skopje (Monday to Friday, 08:00 to 16:00). A request is a new claim, a member's message or a Help Now request; each kind is measured and reported apart (your answer 18) | WP-11 |
| 100% of payments reconciled with an invoice, a fiscal receipt or a bank confirmation | The reconciliation match of the ledger; a list of what is not matched | WP-07, WP-08 |

Today none of the three can be computed from stored data. No operator is notified of a request (CASE-02), and the ledger holds Paddle events only.

### 6.4 The three suspension triggers

The business owner's rule: new registrations stop at once; service to existing members continues; a restart needs a verified correction and the CEO's approval. The switch is WP-10.

| Trigger | Can it be detected today? | What makes it detectable |
|---|---|---|
| (a) Unauthorized access to a case | **No.** A refused attempt leaves no record: the wrapper returns an error and writes nothing (`apps/web/src/lib/safe-action.ts:166-171`), and a search found no code that records a refusal. An opened case is not logged; only document views, downloads and shares are | A record of every refused attempt on a case or a document, written in the wrapper (WP-02). A record of every opening of a case by staff, an agent or an administrator. A weekly review of both, and an alert on any refusal across tenants. Prevention stays with the denial suite of gate line 2 |
| (b) A wrong charge that affects several clients | **Partly.** Amounts are stored per transaction for Paddle events only; cash and invoices leave no ledger | The sale record (what was shown) against the payment (what was received), for every channel. The daily list of differences, grouped by cause; two clients with the same cause raise an alert (WP-07, WP-08) |
| (c) An activation without a verified payment | **No.** Six code paths write a membership row. Only the Paddle paths carry a payment reference; the roster path writes `active` with none (`packages/domain-membership-billing/src/sponsors/provisioning-effects.ts:71-91`) | The three eligibility tests of WP-07, one per kind of membership, run as a daily query each: an active membership that fails the test of its kind is the trigger. An approved company term without a verified payment is such a failure; "approved" alone is not a payment. The test activation of billing cannot be enabled in production (`apps/web/src/actions/billing-test.ts:20-62`) |

### 6.5 The gate to phase 2 (provisional)

Phase 1 met its three criteria and the CEO decided to continue. In addition, because the public arrives: registration stores its consent in the self-service flow as well; sign-in is limited per address and per account, and no single variable can switch the limits off in production (SEC-03, SEC-05); Free Start places nobody in Kosovo by default and keeps an unassigned request unassigned — today a visitor who verifies an address on the door becomes a user of the default public tenant, which is Kosovo when one variable is unset, and the drafts follow (MAIN-21); it is rebuilt so that a draft is stored only for a determined entity, and the default has no value in code; the card channel is live and reconciles; a failure in production can be diagnosed from the logs and the error records (SCTX-05, SCTX-06); the front-door decision of part 4, item 6, is in effect. Run B and run C complete this gate.

### 6.6 Pilot levels under your pilot definition

The finding records carry the pilot level that the practical passes set, under R1's assumptions. Your pilot definition changes some of them. **You confirmed the changes below on 2026-11-17 (answer 24), and they are written into the records** (F-A-150 to F-A-163); each record keeps its earlier level as the one that applies if Paddle is chosen.

| Level | Findings | Changed from the record, and why |
|---|---|---|
| **Blocker before phase 1** | SEC-02, MAIN-15 (S0); DATA-04; POPS-03; POPS-04 with DATA-03 and MAIN-05; MAIN-14, as the fresh secrets of the new production; TEN-01, as the role attestation | — |
| | BIL-06 (S1) | **Raised.** The record accepts a weekly comparison. Imported memberships carry end dates that fall inside the pilot, so a membership must end by date from the first day |
| | POPS-05 | **Raised.** The record accepts an operator who notes each acceptance. About 1,400 members activate by link, so the acceptance must be stored by the software |
| | SEC-11 (S1; its open S0 condition was closed without a check, answer 28); DATA-13 (S1); DATA-14 with DATA-03, as the one build path; SEC-12 (S3 since R3; its controls DB-01 and DB-02 stay blocking before the import), as the revoked privileges of the first setup; SEC-13, as the verified server certificate before the import of members | **New in R2b**, at the pilot level of their records. MAIN-21 and SEC-10 are acceptable with their named controls (WP-10, WP-01) |
| **Acceptable only with a named control, until its package lands** | CASE-03 (S1): the runbook rule and the weekly comparison of its record, until WP-11. CASE-02: a daily review of the queue. CASE-04. POPS-01, POPS-02, POPS-06: the rehearsed procedure. TEST-01, TEST-03: run by hand per release candidate, until WP-16. MAIN-19: one dependency update taken through both guards before the opening. MAIN-17: the skill's trigger disabled | — |
| **Not in the pilot unless Paddle is chosen** | BIL-03, BIL-11, MAIN-20 (blockers in the records), BIL-01, BIL-02, BIL-10, BIL-13, BIL-14, BIL-04, SCTX-01, SCTX-02, TEST-02 | **Changed, and since R3 in the records.** Their requirements stay, in provider-independent form, in the port (part 7) |
| **Later** | BIL-05 (no self-checkout in phase 1; the constraint of WP-07 closes it), CASE-01, SCTX-14, SCTX-16, MAIN-16, and the findings of group 3 | — |

## 7. Payments

### 7.1 What the port owns, whatever the provider

- **The sale**: plan, entity of record, tariff, price, currency, the rate and its date, the amount in MKD, the version of the terms. The rate is the latest weekly NBRM rate in force at the moment of the sale (your decision of 2026-11-16). Price changes apply to future sales only.
- **The payment**: channel, amount, state, the evidence it rests on, who recorded it and who verified it.
- **The receipt or fiscal document**: its number and kind, per channel. A bank confirmation is not a fiscal receipt unless the accountant says so.
- **The ledger**: entries in whole minor units; a correction is a new entry, never an edit. A wrong or duplicate payment is corrected; there is no automatic refund for the unused part of a year.
- **Reconciliation**: each payment matched to a deposit, a statement line or a settlement.
- **The membership period**: start and end; one live membership per member; the end is enforced by date; one notice a month before the end; no automatic renewal and no automatic charge in the pilot.
- **Inbound events of an adapter**: recorded once, applied in order, acknowledged only after the effect, listed and re-driven when they fail (R-07, with a sequence test per adapter).

The renewal schedule, the notice, grace and expiry belong to the platform, not to a provider: none of the banks in question manages them.

### 7.2 What stays outside the port

Client compensation, Interdomestik's commission, the split with a lawyer, advances for an expert opinion and their repayment, and the success fee. They are flows of their own (business rule 5; business-owner decision 3.2) and belong to case finance, which is not pilot work. Code that charges a success fee through the membership provider exists and nothing calls it (`packages/domain-membership-billing/src/success-fees/`); it is parked (part 4, item 13).

### 7.3 The billing findings in two groups

| Finding | Provider-independent requirement (built in the port) | Paddle-specific instance (repaired only if Paddle is chosen) |
|---|---|---|
| BIL-01 (S1) | A failed event stays retryable; a redelivery is not answered as a duplicate | The failure states of the Paddle webhook receipts |
| BIL-02 (S1) | An interrupted handler's claim on an event is released, for every event type | 5 of the 7 Paddle event types |
| BIL-03 (S1), BIL-11 (S1) | One route per adapter; every event of one payment is admitted | The per-transaction uniqueness; the older shared-secret route |
| MAIN-20 (S1) | An event that arrives early or fails cannot make a later one stale; a sequence test proves it on a real database | The ordering floor of the entity routes |
| BIL-05 (S1) | One live membership per member, by a constraint | The second checkout |
| BIL-06 (S1) | A membership ends by date; the ledger is compared with the source of money on a schedule | The comparison with Paddle |
| BIL-07 | Failed events are listed, alerted on and re-driven | The receipt table |
| BIL-08 | Corrections of wrong and duplicate payments | Refund events |
| BIL-09 | A ledger in whole minor units that is read, not only written | The decimal columns |
| BIL-04 | A commission is computed from the sale record | The price field of the payload |
| BIL-14, TEST-02 | A journey test per channel and a sequence test per adapter, executed in CI | The seven untested Paddle failure paths; the sandbox purchase after a deploy |
| BIL-10, BIL-13, SCTX-01, SCTX-02 | Covered by rules R-08, R-26, R-09 and R-11 for new code | Catches in the Paddle handlers; addresses in checkout logs; the dunning mails and their repeat |

### 7.4 The order

Nothing is spent on the right-hand column before a provider is decided. WP-07 moves the Paddle code behind the adapter boundary without changing what it does. The change of `AGENTS.md:32` and `docs/plans/current-program.md:393` ("Paddle is the only V3 pilot billing provider") is part of the adoption PR (WP-03), and the change of the requirement is proposed in part 9.

## 8. The first production setup

A new project, set up from what was validated on staging. Today's production is not carried forward and was not reviewed. By your direction of 2026-11-17 staging and today's production are test environments: nothing of them is kept, their settings are not inspected further, and the new project is set up correctly at its creation. **Staging is new as well** (your decision of 2026-11-17, closing pass): the new setup has a brand-new staging project with the same baseline as the new production, so the controls of `DB-BASELINE.md` are set on both at creation; the old staging and the old production projects are deleted later, by you. The code is kept, and retired parts are removed package by package.

| # | Requirement | Proof | Finding |
|---|---|---|---|
| 1 | Fresh secrets. `SHARE_PACK_SECRET` and `CLAIM_UPLOAD_INTENT_SECRET` have values of their own. No release or rollback target was built before 2026-11-09 | The deployment record | MAIN-14 |
| 2 | Migrations are applied by one step of the release pipeline, from the repository, before the alias moves; the step was rehearsed. The only procedure today is a note in a memory entry | The pipeline run; the runbook | DATA-03, DATA-02 |
| 3 | The application connects as a role that cannot bypass row-level security: not a superuser, without BYPASSRLS, **owner of no table and member of no other role**; the test role `interdomestik_rls_test` does not exist | A runtime attestation at start that covers attributes, ownership and membership, and its output; the queries Q3a to Q3c of the baseline. Today's attestation reads the two attributes only (`packages/database/src/rls-role-assertion.ts:70-84`; review comment R2b-C06) | TEN-01 |
| 4 | Backups are configured, and one restore drill recovered the database, the documents, the configuration and the needed keys into an isolated project. Confirmed payments came back without a double entry | The drill record with the measured recovery point and time; the provider's backup settings. The objectives, approved by you on 2026-11-17 (question 33): recovery point 15 minutes for the database and 24 hours for stored documents; recovery time 4 hours inside staff hours, otherwise by 10:00 of the next working day (`DB-BASELINE.md`, part 9). The new production runs on a plan with point-in-time recovery (your answer 19) | POPS-03 |
| 5 | One release was rehearsed with one revert. A migration keeps the previous build working | The rehearsal record | POPS-04, MAIN-05 |
| 6 | No test role, test user or test data. The E2E endpoint and the test activation of billing cannot be switched on. The seed commands refuse the new project: its reference is on the guard's list before the project holds data, or the guard is an allow-list of the projects that may be seeded; today it knows production by one reference written into the file (`packages/database/src/seed-target-guard.ts:10,75-98`) | A start-up check that refuses the variables; the list of accounts; a guard test that names the new project and expects the refusal | TEN-02, DATA-04 |
| 7 | Every scheduled job is listed with its schedule and its last success. The two mechanisms are not both enabled for the same job | The scheduler inventory | MAIN-11, SCTX-09 |
| 8 | A missing or malformed environment value stops the start. The rate limiter cannot be disabled by one variable. The default public tenant is set explicitly to the pilot entity, and an unset value stops the start instead of meaning Kosovo. The two variables that add a social sign-in are refused | An environment schema; a start-up check | SEC-08, SEC-05, SEC-03, MAIN-21 |
| 9 | The release-evidence check works without scanned documents: signed evidence is in private storage, and the repository holds hashes, roles and dates. The repository is private before the first real member data are imported, and before the pilot opens if that comes earlier (your decision 6 of 2026-11-18), after the dated cost and capability check (four parts, question 25). A cost problem waives neither R-10 nor this line; no rule of this review depends on whether it is public or private | The check passing on the manifest; the repository setting | MAIN-15 |
| 10 | A failed scheduled job and a failed payment event raise an alert that reaches a person | One test alert each | BIL-07, SCTX-07 |
| 11 | The release record names the deployed commit | The record | MAIN-05 |
| 12 | The database of the new project meets the baseline. Its blocking controls: the Data API off and no privilege of its roles in `public` (DB-01, DB-02); row-level security and a policy on every table, none that passes without the tenant setting, shown by denied-operation tests under the runtime role and by a reviewed policy list (DB-09, DB-10); a statement, a lock and an idle-in-transaction limit on the application's roles (DB-12 to DB-14); run-time connections on the transaction pooler, and a rehearsal with concurrent sessions (DB-17, DB-19); database connections that verify the server certificate, before the import of members (DB-21); storage by service role and signed URL alone (DB-24); one build path whose result shows no unexplained difference from the declared schema and the registry of SQL-managed objects (DB-27, DB-28); only the pilot entity active (DB-32) | `DB-BASELINE.md`: the queries Q1 to Q9 of its part 11 with the limits of its part 11.1, the denied-operation tests, the phase 0 rehearsal, and the settings of its part 10, set when the project is created | TEN-01, DATA-03, POPS-03, DATA-13, DATA-14, SEC-12, SEC-13 |
| 13 | The production environment names exactly one host, `ida.*`; no country host serves the application; the trusted sign-in hosts of production are that host and nothing else, with no name pattern, no generated hosting name and no staging host; staging and previews have lists of their own and sit behind the platform's deployment protection (your answer 28) | WP-19; WP-01; the environment schema; the list printed at start | SEC-11 |
| 14 | No agent tool is connected to the production project; agent access to staging is read-only; no agent tool can merge or force-push; no checkout is linked to the production project. The DNS zone of the production domain is never moved without its mail records, and a release tag is never moved or pushed again (your answers 17, 30 and 27 g) | The connector and tool settings, checked by you before the project holds data; the registrar's record of the zone | — |

## 9. Proposed changes to the requirements baseline

Proposals only. Nothing is applied, and the baseline and its amendments keep their authority until you change them.

| # | Where | Today | Proposal |
|---|---|---|---|
| 1 | SRS IDA-FIN-001 | "Pilot membership billing shall use Paddle only; Stripe or parallel provider logic shall not be introduced without canonical approval." | "Membership payments shall go through one provider-neutral payment port. A provider or an acquirer is an adapter of that port and is chosen per market by finance and legal. No provider name shall appear outside its adapter." |
| 2 | SRS, new requirement beside IDA-FIN-001 | — | "Cash shall be a channel of the payment port. Only an authorized agent or employee records it. A receipt or fiscal document is issued at once. Activation waits for staff verification by another person. Each cash payment passes the states paid, held by the collector, handed over, deposited and reconciled, and is matched to its bank deposit. The trail is complete." |
| 3 | SRS IDA-IAM-001 | "Supabase Auth shall remain the identity and session system of record, Better Auth the orchestrator, …" | Align the text of the requirement with the amendment that already replaces it (`docs/architecture/amendments/2026-11-07-pd-r5-iam-v1.md`): "Better Auth, used only through `@interdomestik/shared-auth`, is the identity and session authority. Supabase provides PostgreSQL persistence." |
| 4 | SRS, release frame (§11.7) | No pilot stage; acceptance clauses carry no thresholds | Add a pilot stage with the three criteria and the three suspension triggers of the business owner as its thresholds |
| 5 | SRS IDA-IAM-004 | Nine canonical roles | No change to the catalogue. Add: "A tenant may be limited to a subset of roles." The pilot tenant has five |
| 6 | SRS, new requirement | No requirement covers a case that involves two entities | "The case stays with the entity that holds the mandate. Work of another entity on the case is recorded as a service between entities: the two entities, the case, the agreed basis, the amounts and currency, the state (agreed, invoiced, paid) and the documents. It is kept apart from membership payments, client compensation, the commission and the split with a lawyer. The platform moves no money for it." The design goes to run B |
| 7 | Release conditions | — | The lawyer's written opinion on the membership model is a condition of the first sale in a market; the platform classifies nothing |
| 8 | `AGENTS.md:32`, `docs/plans/current-program.md:393`, `docs/plans/architecture-finalization-program-2026-05-29.md:340` | Paddle as the only provider; no billing abstraction | Replaced by rule R-18 in the proposed `AGENTS.md` |

## 10. Do not touch

Work that would cost more than it gives, or that would damage what is sound.

- **The tenant-authority capability, the row policies and their real-database suites.** Extend them; do not restructure them.
- **The claim transition command.** Rules move into it (WP-11); it is not rewritten.
- **The proxy** and the canonical routes: only with your approval, one change at a time.
- **The identity authority.** No second way to sign in, no bypass for tests in production.
- **Every mandatory check**, until its replacement is approved under the A5 conditions (`RULES-MAPPING.md`, part 3).
- **The dependency holds** (R-27).
- **The Paddle integration**: no repair, no extension, no removal, until a provider is decided.
- **Today's screens**: no repair work beyond what blocks the pilot; they are replaced.
- **Entity migration, sponsored-seat variants, success-fee charging, the unwired migration runner, the event relay**: parked. Nothing new is built on them.
- **Today's production**: not touched from any session, not carried forward.
- **Historical ledgers and dated plans**: they stay as history and are not edited.
- **Historical cases and payments** of the business: not migrated.
- **A change of architecture style.** No evidence asks for one.

## 11. Delivery speed and technical debt

Written in R2b, and linked from here.
- **`CI-GATE-PROPOSALS.md`**: the critical path of a PR (one 30-minute browser job and one required check that waits), a proposal for each of the 34 checks under the A5 conditions (one removal: `pr-finalizer`; no test removed), a target time (15 and 20 minutes for a product PR, 5 for a documentation or copy PR), the specification of the 26 proposed checks with today's count of each, the instruction-drift check with its failing and passing examples, the ten guards that already run, and the root scripts (76 of 248 have no user in the repository). WP-06 carries out what you approve of it.
- **`TECH-DEBT-REGISTER.md`**: one row per item from R1 and R2, each tied to a package of this document or to none, with the decision: before any new feature, before the pilot, later, or accept. Debt in screens that the rebuild replaces is listed once and not ranked.
- **`DB-BASELINE.md`**: the database of the new production, control by control: the value on staging and on today's production, the recommended value, the reason, how the first setup verifies it, and whether it blocks the pilot. It is line 12 of part 8.
- **Agent instructions outside `AGENTS.md`, module contracts, shared helpers, one recipe** (your instruction of 2026-11-17 limited this step to what affects the pilot): the replacement of the Claude `interdomestik` skill, which no longer starts anything by itself (`A/skills/claude-interdomestik/SKILL.md`); a verdict for every instruction surface that can change what an agent does for the pilot (`A/INSTRUCTION-INVENTORY.md`, part 15.1), among them six directory override files that the rule mapping had missed; six module contracts (the six `MODULE.md` files); the reuse catalogue that the proposed `AGENTS.md` names (`REUSE-CATALOG.md`); the recipe of the correspondence register (`FEATURE-RECIPES.md`; WP-12). Marked `UNREVIEWED`, with the reason and the missing evidence: the revision of the Codex skill, the verdict per slice runner, the development guide, a verdict per memory file, and the two recipes that are after the pilot (`A/unreviewed-for-B.md`, section 6).
- The classification of the root scripts and the trace of the legacy commands in CI are in `CI-GATE-PROPOSALS.md`, part 6. The legacy validation is selected by changed paths; in November it ran four times, each time only because the CI workflow file itself is on its list.
- **Decided on 2026-11-17 (your answer 29):** the targets; `pr-finalizer` leaves the required checks; `audit` is split, and its three governance-document steps leave with the retirement of the program and the tracker as authorities; lanes by risk tier follow once the replacement checks run. Each is carried out by a change to branch protection or to a workflow, and until then the check stays. Not decided, and nothing in this review assumes it: the slice runners (question 32).

## 12. Owner questions

This part stands in `DIRECTION-QUESTIONS.md`, beside this file. A guard of the repository refuses a Markdown file above 131,072 bytes, and this document has to be able to grow.

## 13. Not verified, not measured

This part stands in `DIRECTION-QUESTIONS.md`, beside this file. A guard of the repository refuses a Markdown file above 131,072 bytes, and this document has to be able to grow.
