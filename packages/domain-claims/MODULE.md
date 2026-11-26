# MODULE — `packages/domain-claims`

Module contract, adopted from the review of 2026-11-13 (run A). Paths that begin with `A/` or `inputs/` cite the review record, which is kept outside this repository. Written by a helper on Opus 5.5 from the R1 reports and the code at `ef1bd0ef5`; reviewed by the main session on Fable 5.2, which re-read: nothing line by line: this file rests on R1's case-handoff report. The severities were set from the finding records, and the work packages were named. Rules of `AGENTS.md` that bind this area: R-08, R-11, R-16, R-17. Line numbers into `docs/engineering/DIRECTION.md` are those of 2026-11-17, 01:00Z; the work-package numbers are the stable reference. **Corrected in R3 (2026-11-17)** after the independent review of R2b (comment R2b-C03): every statement of this file was checked against the pinned commit and the active finding records by a helper on Opus 5.5 (`A/raw/R3/modules/modcheck.md`), and the main session re-read the lines behind each correction it took. "Owned" means the package whose exported commands should write a table; `packages/database` declares every table and owns none (R-16).

## Responsibility

Owns the claim case: its lifecycle state and the guarded transition between states, assignment to a staff owner, the staff and admin read scopes, the support handoff, and the claim pack. The event table is the case history.

## Public API

The staff and admin actions call `changeClaimStatus` from `./claims/change-status` and `changeClaimAssignment` from `./staff-claims/assign`. Both commands take the actor from the tenant authority principal. A successful status change returns the canonical claim ID for cache refresh. `./claims/transition-guard` exposes the status graph and guard. Submission, creation and draft updates use `./claims/submit`, `./claims/create` and `./claims/draft`.

`./claims/service-level` calculates deadlines in Europe/Skopje. `./claims/service-level-report` counts claim requests and support handoffs. Set the server environment variable `SERVICE_LEVEL_REPORTING_START` to an ISO date in UTC or an ISO instant with an offset. The report returns `reporting_start_unset` when that setting is missing or unparseable.

`./staff-claims/scope` exposes `buildStaffClaimReadScope` for staff-recipient eligibility and `canStaffReadClaim` for applying it in a caller-owned transaction. The scope accepts staff identity and branch as values or as columns in a joined query.

`getMemberClaimTitle` reads the title needed by legacy in-app notifications. It requires the admitted member's session authority and scopes the lookup to the authority's tenant and owner and the supplied claim ID. An absent or invisible claim returns `null`.

`./claims/draft` — `updateDraftClaimCore` returns `UpdateDraftClaimResult`: `{ success: true }` or `{ success: false, error, code? }`. `code` is the contract a screen maps to catalogue text (R-09); `error` is an English diagnostic, never shown as is. Codes: `CONFLICT` (the draft's owner or lifecycle changed: nothing was written, reload and retry); `INVALID_PATH` (a new file without a verified initial upload intent, a read-only role, or an object already the document of another case, decided only after the intent was verified); `INVALID_BUCKET`, `INVALID_TYPE`, `INVALID_SIZE` (file metadata); `INVALID_PAYLOAD` (the same object twice in one request). Without `code`: not found, access denied, not a draft, schema refusal, or an unexpected failure (logged). `files` lists the files to attach: every entry is verified, a file already attached to this draft too (it then needs a still-valid intent and is not inserted again); a client should send only new files. Attachments are never removed by this command. Today no rendered screen calls the draft update (`apps/web/src/components/claims/claim-edit-form.tsx.disabled`); the screen that re-enables it maps these codes.

## Owned tables

`claims` and the claim counters (`packages/database/src/schema/claim-core.ts`, `claim-counters.ts`, `counters.ts`); the claim support tables and threads (`claim-support-tables.ts`, `claim-threads.ts`: `claim_messages`, `claim_stage_history`, `claim_threads`); information requests and their evidence links; the commercial and recovery tables; `support_handoffs` (declared in `schema/crm.ts:750`, not in a claim schema file); `case_scoped_access_grants`, the time-bound access of another entity to one case, which the database contract assigns to this package: the only code that inserts a grant is this package's jurisdiction handoff (`src/claims/jurisdiction-handoff-store-insert.ts:31`), which has no production caller today (TEN-03), and the documents route reads the table (`apps/web/src/app/api/documents/durable-case-grants.ts`) (added in the closing pass, review comment R3-C05); and `claim_transition_evidence`, the proof rows that the transition guard reads (`schema/claim-transition-evidence.ts:25`) — nothing writes that table today. **Not owned here:** `claim_documents` belongs to the documents area (`apps/web/src/lib/storage/MODULE.md`); this package cites a document and writes its row only through that area's command. That is the target: today both write it (the web app at 8 sites, this package at 2; the unit's count). The R2b text claimed the document rows and the transition evidence for both areas at once. Written from outside the owner: R1 measured 166 Drizzle call sites in the claims stratum — 33 scoped-helper, 91 hand-written, 42 with no tenant token (`A/modules/tenancy.md:88`); `apps/web/src/features/admin/claims/**` and `apps/web/src/actions/**` wrote claim rows directly at the time of that review. `claim_messages` and `claim_counters` are each **declared twice** (DATA-09, `packages/database/src/schema/claim-threads.ts:70-120`); that one twin describes columns that do not exist is `UNVERIFIED` here.

`claim_response_requests` records the request and first answer for a claim submission or qualifying member message. It is declared in `packages/database/src/schema/claim-response-requests.ts`. `support_handoff_first_responses.first_public_response_at` (one row per handoff, written in the transaction of its first public response) records the first public answer for handoff reporting.

## Invariants

- `./admin-claims/visible-ops-claim` exports the pure `canViewAdminClaims` role predicate, which the web claims visibility module re-exports. This subpath also exports `readOpsClaimAuthority(authority)` for admission before opening a transaction and `selectVisibleOpsClaim(tx, { authority, claimId })` to build a fixed subquery in that transaction. Both require registered, unexpired authority and return null unless it is session authority with matching tenant IDs and an admitted principal. The subquery matches the exact claim, uses the effective access tenant with the null-access home fallback, and uses its private branch SQL fragment to confine branch managers to their verified branch. The documents owner uses the same subquery for initial selection and its document visibility recheck, inside the transaction opened with that authority.

- There is **no `status` column**: the status is the pair `case_lifecycle_state` + `recovery_lifecycle_state` with a `lifecycle_version` counter (`packages/database/src/schema/claim-core.ts:36-48`; mapping at `src/claims/lifecycle-state.ts:18-55`). Nine statuses (`A/modules/case-handoff.md:47`).
- Only 27 directed transitions are allowed, plus a same-status call — enforced in code by `ALLOWED_CLAIM_STATUS_TRANSITIONS` (`src/claims/transition-guard.ts:50-60,66-69`, MEASURED in `A/modules/case-handoff.md:51`). Database CHECKs pin the status pairs (`packages/database/src/schema/claim-core.ts:84-101`).
- The staff and admin actions use the shared status command. It locks the scoped claim, applies the decline and recovery prerequisites and checks the lifecycle guard before writing. The lifecycle version also guards the write. Recovery transitions lock the agreement and membership inputs and use one effective time for coverage and usage.
- Claim numbers are unique within a tenant and allocated atomically — database: unique `(tenant_id, claim_number)` and a counter PK `(tenant_id, year)` (`schema/claim-core.ts:83`; `packages/database/src/claim-number.ts:128-138`).
- A claim is assigned only to staff who can see it — **NOT ENFORCED** (CASE-01, S2): a claim can be assigned to staff of another branch, who then cannot open it, and nobody is alerted (`src/staff-claims/assign.ts` and `src/staff-claims/scope.ts`). Root cause: **five different staff-scope predicates** (CASE-05, `scope.ts:24-36`, `access-policy.ts:46-63`, `upload/server/access.ts:47-51`).
- A claim always has a branch — **NOT ENFORCED**: a claim without one is invisible to branch-bound staff queues (CASE-08, `submit-assignment.ts:121`; `staff-claims-list-filters.ts:51-53`).
- A message is refused on a closed claim — **NOT ENFORCED** (CASE-06, `actions/messages/send.ts:39-55`: the send never reads the claim's status). A public staff reply notifies the owner and answers open requests. A qualifying owner message creates a response request and notifies scoped staff or the tenant administrator.
- The case history is complete and append-only — **NOT ENFORCED**: audit tables are mutable in the database and three paths write the audit row **after** commit and swallow the failure (DATA-06; CASE-12, `lib/audit.core.ts:46-81`).
- Claim amounts are integers in minor units with a currency — **NOT ENFORCED**: `amount decimal(10,2)`, nullable `currency text DEFAULT 'EUR'`, no CHECK (`schema/claim-core.ts:53-54`).
- A claim document belongs to its claim's tenant — application only for plain evidence; the database enforces it with composite FKs for request-linked evidence (`schema/claim-support-tables.ts:19-25,40`; `drizzle/0094_request_linked_evidence.sql:20-21`).

## Tenant boundary

WP-19 evidence confirmation calls `./claims/evidence-confirmation` inside the existing session
tenant transaction. `lockClaimForEvidence` rechecks home and effective access, member ownership
or workforce scope on the locked claim, then locks the open information request when applicable.
The same transaction checks request linkage on replay and uses `linkInformationRequestEvidence`
to append the link and its audit row after a new document is created.
The dependency-free `./claims/member-upload-role` export supplies the member-side role predicate
to both the claim lock and the web upload validators.

`./claims/send-message` composes the message write, response requests and notifications in one tenant transaction. Message and recovery decision commands take the actor from the tenant authority principal and require the session to match. The recovery decision action uses `resolveRecoveryDecisionActor` to apply the same check before reserving an idempotency key. An admin can post an internal message only in their home tenant. Staff routing and the send-time staff eligibility check use the same staff claim read scope. `./claims/notification-delivery-runner` drives the queue through the communications worker operations.

Reads and writes run inside `withTenantAuthority`; the staff read scope adds branch and ownership predicates on top (`src/staff-claims/scope.ts:24-36`). Document access on this journey is tenant-bound and role-bound (`A/modules/case-handoff.md:204`: full-tenant roles, owner, uploader, staff only when `staffId` = self, agent scope, case grant, never staff on a draft). R1 found **no cross-tenant or cross-member reachability** in the files it read, with the cross-tenant grant fallback and the agent document scope **not opened** (`A/modules/case-handoff.md:206`).

## Live and not live

Live: draft → submit → the staff queue, assignment, the transition command, messages, evidence upload and download, the support handoff (`open → accepted → closed`, `src/support-handoffs/lifecycle.ts:86-107,239-260`). Not live: the **jurisdiction handoff has no production caller** — 627 LOC in 14 files (CASE-10, `A/raw/CASE/entry-point-reachability.txt`); the staff and admin status actions notify the claim owner after a real status change. **A lead of R3, not a finding (no skeptic pass):** before a claim of category `vehicle` moves to `negotiation`, before an injury claim moves to `negotiation`, `court` or `resolved`, and before any claim is `submitted_to_airline`, the guard asks for proof rows in `claim_transition_evidence` (`src/claims/transition-evidence.ts:30-37,76-89,100-140`; `transition-guard.ts:107-109`), and no code writes that table (searched in `apps`, `packages` and `scripts`). If it holds, those transitions are refused for every claim.

## Tests to run

`pnpm --filter @interdomestik/domain-claims test`. R1 MEASURED **197 test files** across the 16 directories of this journey, but read titles only, so the strength of each assertion is UNVERIFIED (`A/modules/case-handoff.md:225`). Named: `src/claims/transition-lifecycle-cas.test.ts`, `src/staff-claims/assign.idempotency.test.ts`, `src/support-handoffs/lifecycle.test.ts`, plus the web-app ops-action tests (`A/modules/case-handoff.md:228-235`). They run in CI inside the coverage step: `.github/workflows/ci.yml:138` (`pnpm coverage:gate`, whose `test:coverage` runs the web suite, `shared-auth` and every `domain-*` package, `package.json:86-87`; the step is skipped when coverage is reused, `ci.yml:137`).

## Do not reach into

The internal status transition writer. Call the shared command through its public export. The five scope predicates outside `src/staff-claims/scope.ts` (CASE-05). The claim tables from `apps/web/src/features/admin/claims/**` directly rather than through this package's exports.

## Decided for this module (owner, 2026-11-17; decisions, not verified properties of today's code)

- A status that the member can see notifies the member, from every entry point (answer 16; CASE-03 is a defect, WP-11).
- Staff get no access to a member's draft, protected files included; a branch manager sees no document, message or note content, only counts; staff have no free private chat: every internal message is tied to a case or a request and is audited (answer 27 b, c, d).

## Case authorities, correspondence and Green Card fields (WP-12 v13)

This section records the approved WP-12 contract, design v14.1 (appended tables; Astra design round 13 YES). This package owns `claim_authorities`, `claim_correspondence`, `claim_correspondence_documents` and `claim_case_fields`. The register grants no access to anyone. The authorization record is the owner's 2026-11-22 “Yes, authorize” and, for the v14 changes, the owner's 2026-11-23 “Yes, re-authorize”.

### Stored columns

| Table                            | Columns                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim_authorities`              | `id`, `tenant_id`, `claim_id`, `correlation_id`, `kind`, `scope`, `evidence_document_id`, `evidence_bucket`, `evidence_file_path`, `version`, `jurisdiction_country_code`, `jurisdiction_attested_by_user_id`, `jurisdiction_attested_at`, `purpose`, `granted_at`, `expires_at`, `revoked_at`, `revoked_by_user_id`, `recorded_by_staff_id`, `created_at`                                                                       |
| `claim_correspondence`           | `id`, `tenant_id`, `claim_id`, `correlation_id`, `direction`, `party_kind`, `party_organisation`, `party_reference`, `party_contact_name`, `channel`, `occurred_at`, `body`, `in_reply_to_id`, `recovery_authority_id`, `representation_authority_id`, `sharing_authority_id`, `shared_document_count`, `sharing_attested_by_user_id`, `sharing_attested_at`, `follow_up_at`, `decided_at`, `recorded_by_staff_id`, `created_at` |
| `claim_correspondence_documents` | `tenant_id`, `claim_id`, `correspondence_id`, `claim_document_id`, `document_bucket`, `document_file_path`, `created_at`                                                                                                                                                                                                                                                                                                         |
| `claim_case_fields`              | `tenant_id`, `claim_id`, `other_vehicle_country_code`, `insurance_proof_reference`, `outside_handling_party`, `coverage_verification_status`, `case_follow_up_at`, `updated_by_staff_id`, `updated_at` (one row per claim at most; no row means the defaults)                                                                                                                                                                    |

### Commands and queries

- `recordCaseAuthority`, `revokeCaseAuthority`, `listCaseAuthorities`.
- `recordOutboundCorrespondence`, `recordInboundCorrespondence`, `setCorrespondenceFollowUp`.
- `listClaimCorrespondence`, `getClaimCorrespondenceSummary`, `getGreenCardCaseFields`, `updateGreenCardCaseFields`.
- `listRegisterCitationNames` returns names for supplied, cited case documents only when the existing claim-document metadata policy admits the reader.
- Staff queue request progress uses the effective tenant and the intersection of the staff case-page scope and assignment. Register deadlines use the register's admission.

### Register invariants

- Home-tenant RLS and composite foreign keys bind the case, actors, authorities, replies and document identities. A citation's identity key to `claim_documents (tenant_id, claim_id, id)` is `ON DELETE RESTRICT ON UPDATE RESTRICT`, so a cited document cannot be deleted or replaced under the same key. The `claim_documents_coordinates_frozen` AFTER UPDATE trigger refuses any change of a case document's tenant, claim, id, bucket or path (all rows; no overwrite, R-35). The insert guards compare the readable copies with the locked document row, and an AFTER INSERT check repeats the comparison on the final citing row.
- `claim_case_fields` has at most one row per claim; no row means the defaults (`coverage_verification_status` `not_checked`, the other fields null). Its policy shows a row only while its claim is visible. The claim key cascades on a claim delete. A case-field edit is a compare-and-set against the values the editor saw.
- Each case can have one authority of each kind. A recovery agreement or signed assignment has recovery scope. A power of attorney has representation scope and requires the recorded jurisdiction and server-stamped staff attestation. Consent or lawful-basis evidence has document-sharing scope and requires a purpose. Revocation changes only the revocation actor and server time, once.
- Outbound correspondence needs both a recovery agreement and an attested power of attorney active at the guard's decision time. Sending case documents also needs active purpose-specific consent or lawful-basis evidence and a staff attestation for this disclosure. Commands lock the home claim, then authority rows in id order, then documents in id order. The guards enforce basis validity and a deferred trigger enforces the declared link count.
- Inbound correspondence may reply to an outbound row on the same case. Inbound recording, outbound follow-up changes and case-field changes remain available after a revocation. Correspondence content and document links are append-only. A contact name is stored only on the register row.
- Recording an outbound entry and setting its follow-up are separate commands. The record's correlation ID replays across follow-up changes, and a follow-up edit supplies the previously read date to detect a concurrent edit.
- Assigned staff within staff scope, `admin` and `tenant_admin` can write on a non-draft case. Scoped staff and home-tenant administrators, including `super_admin`, can read full content. Branch managers can read the count and dates for a home case in their branch. Follow-up attention is computed at read time.
- Creation, draft editing and submission require an open canonical intake category. The database applies the same rule to inserts, category changes and transitions out of draft. Real-database tests and seeds insert claims with canonical open ids. Existing non-draft claims keep their category when moving between non-draft states. Coverage verification status records what the outside party said.

### Reads

The register access module re-exports input validation and normalization from `case-register-input`. The correspondence reader delegates its bounded date query to `correspondence-summary` within the same tenant transaction.

- The correspondence register is read in pages (20 per page, at most 50) through the shared page clamp; replies are read for the page's entries only. The branch summary reads the total and the latest 50 dates. Authorities need no page: at most one row per kind.

### Named limits

- The register picker shows the latest 100 eligible case documents. An outbound entry can cite at most 20 documents.
- jurisdiction rule pending legal review
- consent-purpose rule pending legal review
- member and agent reads of the register are not opened here; they open with their screens and portal predicates;
- deviation from the reuse line of DIRECTION WP-12: share packs hold only `documents` rows (`apps/web/src/app/api/documents/share-eligible-documents.ts:46-60`), while case evidence lives in `claim_documents`. Follow-up: "extend share packs to case documents";
- the database has no user principal (`packages/database/src/tenant.ts:38-44`), so actor admission on direct runtime-role writes stays in the commands. This is platform-wide; Astra r3 upheld it;
- the contact-name deletion waits for WP-13.
- Rows written outside the application whose `claim` key fields exceed the B-tree entry limit of the `claim (tenant_id, id)` unique index (about 2,700 bytes per indexed tuple) are out of scope; the release preflight reports `claim` rows with `octet_length(tenant_id) + octet_length(id) > 2000`, and a failed index build fails the whole migration.
- The citation SQL accepts only the `claim-evidence` bucket. A deployment that configures another evidence bucket cannot cite its documents until the SQL rule takes the same setting.
- In the pilot, a revoked authorization basis cannot be re-granted on the same case.
- intake (`unassigned`) uploads cannot be cited until a verified upload-to-claim binding exists; staff use the assigned-claim upload for instruments and documents to be sent;
- the existing draft-attachment defect (caller-supplied storage path on `claim_documents`, reported under R-37) is not fixed here; WP-12 only refuses such rows as evidence or sent documents.

## Open findings

CASE-01…CASE-12 (`A/modules/case-handoff.md:252-265`), DATA-06, DATA-09. Work packages: WP-11 (claim rules and notifications in the shared command; a delivery record) and WP-12 (case fields for scope B; the correspondence register). WP-12 needs WP-02 (the wrapper) and WP-05 (the checks of the screen contract) first; the deletion of what the register stores about a contact person waits for WP-13.

## WP-12.1 inbound received documents

Design v4, Astra rounds 3–7, and the owner's November 26 authorization govern this pilot. A case-home visibility decision reserves the exact PDF, recipient, assigned uploader, document ID and object key before upload. Assigned staff can record intended-for-member; a home tenant administrator can record approved-to-show. Received links cite approved ordinary documents and use an immutable per-entry seal for the exact received set. They confer no sharing authority.

The correspondence API exports `hasUniqueReceivedDocumentIds` so the staff action can reject duplicate IDs before reading the case's upload-pause state. The domain command applies the same check before querying the case.

Staff writes intersect the branch on the staff row with any branch restriction carried by the session. The upload action reads back the approved private object and checks its byte count and digest. Publication in the restricted tenant transaction requires the database receipt.

**Activation preconditions**

Keep pilot enrollment empty until all four prerequisites have landed and passed their release proofs. Before the first case is enrolled, storage-path PR B must deliver its read-side checks and a tenant- and principal-bound PostgreSQL receipt verifier that works with the Supabase Data API disabled. The guard admission must explicitly cover both uses, receive independent R-37 review and have explicit owner authorization. After server readback of the exact private bucket and key, the verifier may record a receipt only when the stored byte count and SHA-256 match the immutable decision. PostgreSQL must refuse first publication without the receipt for that decision. The restricted writer must be unable to create or alter a receipt or assume the verifier role. Prove refusal for a missing or mismatched receipt under the actual restricted role and successful publication through the actual verifier with the Data API disabled. Keep the release-controlled issuance pause, drain and per-case legacy-credential disposition before enrollment.

1. Durable-grant authority and the case-tenant foreign key.
2. Assignment and agent-link write integrity.
3. The WP-19 documents boundary.
4. Storage-path canonicalization, authorized separately by the owner on November 26 after Astra round 8. WP-12.1 reserves the exact approved coordinates and detects aliases of reserved filenames. The prerequisite adds canonical-path checks to both document tables.

Each case also requires recorded legacy-credential disposition after the release-controlled issuance pause and drain. Keep uncertain, refused or oversize files in approved office custody. The assigned handler records the opaque receipt reference, received and hold times, and responsible role in the office record until approved release or disposition. During rollback retain reservations, publication guards, ordinary reads and legacy staff upload closure for enrolled cases.

Enrollment and pause changes serialize on the case row. The case lock protects ordinary publication across activation and received links across rollback. During a pre-enrollment pause all legacy issuers and confirmations are closed for the case. During an enrolled rollback pause authorized member and agent self-supply continues. Only enrolled cases create receipt seals. Each approval gives one 15-minute upload window measured from its database decision time. Reissuing an intent uses the same deadline. The current assigned handler can replay a committed publication after that window to recover the original document ID.
