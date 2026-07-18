---
title: IDA-DG18 UI03a1 Verified Secure Free Start Drafts — Prospective Design
date: 2026-07-18
status: prospective_review_accepted
authority: advisory_until_merged
runtime_authorized: false
promoted_slice: IDA-UI03a1
protected_addendum: IDA-DG18A
binding_receipt: ida-ui03a1-design-binding-v0.1.json
risk_tier: 3
base_sha: 215cf95a2b5b62129d180d97e5fc77c9edb82e6a
owner: platform + product + security + privacy + accessibility + qa
---

# IDA-DG18 — UI03a1 Verified Secure Free Start Drafts

## Promotion decision proposed

Promote exactly one prospective Tier 3 implementation slice:
`IDA-UI03a1 — verified secure save, resume and manage for the pre-membership Free Start journey`.

This prospective gate is docs-only. It does not authorize product edits, runtime work,
rollout or deployment. Product work may start only after this gate and the separately
hash-bound protected-surface addendum merge, the worktree resolver selects only
`IDA-UI03a1`, and the delegated orchestrator records exact runtime acceptance.

The pre-gate resolver truth is
`blocked_requires_current_authority / umbrella_without_concrete_promoted_slice /
activeSlice=null`. The clean worktree and `origin/main` both began at the exact base SHA
above. No replacement or adjacent slice is selected.

## Goal, user and outcome

- Primary user: a person using the neutral IDA Free Start organizer before a claim or
  active membership exists.
- Entry point: the existing premium Free Start category/details/preview/complete shell
  on the neutral IDA public home surface.
- Business outcome: prevent avoidable abandonment without turning Free Start into a
  claim, case, payment or membership promise.
- Exit state: the user either continues locally without saving, or has an authenticated,
  owner-isolated draft that can be reviewed, resumed, updated or hard-deleted.
- Numeric outcome: deterministic restoration improves from `0/6` durable normalized Free
  Start facts today to `6/6` saved normalized facts after a new authenticated browser
  session, with no fact re-entry.

## Current truth

The current organizer stores category, issue type, incident date, counterparty, desired
outcome and summary only in React memory. `submitFreeStartIntake` validates and generates
the current informational result but writes no draft, claim or case. Refresh, a day-later
return or a new device loses the facts. Current `data-save-behavior="temporary"` and
no-save/no-case copy are therefore truthful and remain so until an accepted implementation
lands.

Supabase Auth remains the repository-declared identity/session system of record. Better
Auth remains the active orchestrator and session execution path. The existing
`@interdomestik/shared-auth` boundary and the neutral/deferred tenant-classification model
remain intact. This gate does not choose a new identity provider, session model, tenant,
classification, entitlement or claim owner.

## Exact supported workflow

1. Free Start remains immediately useful without an account. No login wall is added to
   category selection, fact entry, preview or result generation.
2. A secondary `Save securely` action appears only on the exact neutral IDA front door.
   It never outranks the current help-first primary action.
3. Saving is deliberate, never automatic. The UI distinguishes `Unsaved changes`,
   `Saving`, `Saved`, `Conflict` and `Unavailable`; a success timestamp is shown only after
   the durable transaction succeeds.
4. An anonymous save or `Resume saved work` action opens an inline, purpose-specific
   SQ/EN/SR/MK email-OTP region using the already accepted neutral Better Auth sign-in
   seam. The current facts remain in React memory while verification runs.
5. After verification, the original intent is retried once: save the current supported
   draft or load the authenticated owner's draft list. Existing authenticated sessions
   skip the OTP UI.
6. The account boundary says to use the same email on another device. A different email
   sees only its own empty list. It does not reveal whether another account or draft
   exists through response status, body or copy and offers no different-email recovery;
   that remains `IDA-UI03b`. Response timing is not equalized and no constant-time claim is
   made. The list action accepts no email or user selector, so an authenticated caller can
   time only the same current-owner rows that the response itself returns; it cannot query
   another email or owner.
   Same-email cross-session identity is a named implementation precondition, not an
   assumed fact: test-only `P00` must prove two completed neutral OTP sign-ins for one
   normalized email return the same Better Auth user id and one `user` row before any
   schema, migration or product edit. Failure is STOP and does not authorize UI03b or auth
   architecture work.
7. The owner list is cursor-paginated and shows derived `In progress` or
   `Ready to review`, category, safe fact summary and last-saved time. It is not a member,
   staff or admin dashboard.
8. `Resume` restores all six supported facts and the safe resume step. A ready draft opens
   at preview; an incomplete draft opens at category or details. It never restores the
   ephemeral generated result and never creates a claim or case.
9. Editing a resumed draft updates that same row. Optimistic version comparison prevents
   a stale tab from silently overwriting a newer save.
10. `Start another` clears the current persisted identity/version from the client and
    begins a new local organizer. Double-click/retry create uses a per-local-draft UUID
    idempotency key and returns one durable draft.
11. Delete requires an explicit two-step confirmation and hard-deletes the fact row. A
    content-free audit row remains with action, actor, tenant, the exact random draft UUID
    and version only. No draft fact, email, summary or health content enters audit metadata
    or logs.
12. If storage/auth is unavailable, the current in-memory organizer continues to work.
    Copy never claims that an unsuccessful or pending save is durable.
13. A valid authenticated session whose home and access tenants diverge receives a plain,
    localized `Secure save is unavailable for this account context` state. No query runs and
    the public organizer remains usable; the failure is not silent and does not invite a
    tenant/classification workaround.

## Data boundary and lifecycle

The durable payload is strictly limited to the existing six fact slots plus UI lifecycle
metadata: `category`, `issueType`, `incidentDate`, `counterparty`, `desiredOutcome`,
`summary`, `resumeStep`, version, idempotency key and timestamps.

- Only `vehicle` and `property` categories are eligible. `injury`,
  `medical_negligence`, unknown keys and any health-specific field are rejected by the
  server contract. The UI says that no dedicated injury or health field is collected.
- Counterparty and summary use one exact idempotent text transform before validation and
  persistence: Unicode NFKC, CRLF/CR to LF, then leading/trailing Unicode-whitespace trim.
  Internal whitespace, casing and punctuation otherwise remain unchanged. An empty result
  is SQL null and API reads map null back to the empty UI string. Category, issue, outcome
  and resume-step ids must already equal an accepted identifier; incident date must already
  be a real `YYYY-MM-DD` calendar date and is serialized back identically. Applying the
  transform twice returns the same value. The summary is bounded to 1000 transformed
  characters. Copy instructs the user to include only supported vehicle/property
  event facts and not medical details. A fixed SQ/EN/SR/MK whole-token screen rejects a
  small enumerated set of high-risk medical terms without logging input or the matched
  term. It is a spill-reduction guard, not a semantic medical classifier and not a guarantee
  that free text contains no health meaning; that residual is stated in the UI/privacy
  truth and remains accepted for this bounded release.
- Uploads, documents, compression, images, evidence files, journey injury/health state,
  result packs, claim ids, case ids, payment data and Paddle correlation are absent.
- Draft status is derived from completeness; there is no mutable status column that can
  drift. `Ready to review` means the six supported facts are complete, not accepted,
  eligible, covered, filed or handled.
- Draft facts are retained until the owner explicitly deletes the draft. This slice makes
  no account/user deletion promise; broader account deletion or audit anonymization requires
  separate authority. No automatic expiry or purge is promised in this slice. The manage
  surface always exposes deletion. Scheduled retention automation would require a later
  privacy/provider/deployment gate.
- Delete is immediate hard deletion inside one transaction. The content-free audit record
  is retained under the existing audit policy and is not a recoverable copy of the draft.
- Transport and storage use the repository's existing TLS and managed database-at-rest
  controls. This gate adds no field-level encryption and makes no stronger encryption
  claim.

## Lifecycle and concurrency contract

- Create: authenticated owner + exact host + valid partial supported payload + stable
  client request UUID; one owner may keep at most 200 active drafts.
- Resume: authenticated owner-scoped read plus content-free `resumed` audit event.
- Update: authenticated owner, draft id and expected version; one compare-and-swap update,
  version increments by one, and content-free `updated` audit is atomic with it.
- Delete: authenticated owner, draft id and expected version; row delete and content-free
  `deleted` audit are atomic.
- Create retries use a unique owner/client-request key. The per-owner limit is protected by
  one transaction-scoped advisory lock so concurrent creates cannot bypass it.
- Wrong owner, wrong access tenant and unknown id use one generic not-found result. Missing
  actor context fails closed at RLS. Server inputs never supply actor or tenant authority.
- List uses stable `(updated_at, id)` descending cursor order and an owner/access-tenant
  index. Page size is 20; there is no N+1 fact lookup.
- Acceptance stress creates 101 simultaneous drafts across isolated owners and verifies
  every owner can read only its own row. A separate same-draft race proves exactly one
  versioned update wins.
- Concurrency proof issues 101 create requests from one shared start latch through the
  existing bounded database pool, then asserts 101 successes/rows and one visible row per
  owner. The same-draft proof prepares two updates with the same expected version behind a
  two-party latch, releases them together, and asserts exactly one success, one conflict and
  one version increment. It uses no timing threshold as its oracle.

## User-visible truth and visual direction

- Keep the current premium cream/navy/teal organizer, editorial spacing and help-first
  hierarchy. The secure-save block is a quiet secondary band below the organizer work area,
  not a dashboard redesign or a competing hero.
- Use clear account/storage words. Public SQ must not use `triazh`, `intake` or imported
  process jargon. EN/SR/MK express the same meaning without claim, case, payment,
  membership or coverage overstatement.
- Exact truth concepts: optional save; verified email required; same email on another
  device; only vehicle/property fields exist; the bounded summary is stored, must omit
  medical details and is screened only for enumerated high-risk terms; no dedicated
  injury/health field or document is stored; no claim/case created; last successful save;
  stale-copy conflict; permanent delete.
- Delete confirmation is visually distinct but not alarmist. Empty, loading, error,
  conflict, limit and success states all offer a next action.
- The generated Free Start result remains full width and ephemeral. Saving after completion
  stores only the supported input facts and resumes at preview.

## Operator benchmark, observed 2026-07-18 UTC

1. GOV.UK One Login save-progress guidance: deliberate save on form pages, sign-in at the
   save boundary, explicit start/resume choices, saved-status confirmation and unsaved-exit
   truth. Source:
   `https://www.sign-in.service.gov.uk/documentation/design-recommendations/save-progress`.
2. UK DBS Save and Return: secure One Login account boundary, optional one-session journey,
   and return after time-out/abandonment. Source:
   `https://www.gov.uk/government/news/dbs-launches-new-save-and-return-feature-for-its-barring-referral-service`.
3. AirHelp contact/status: authenticated customer dashboard for status and email recovery,
   with access to the private interior blocked without credentials. Source:
   `https://www.airhelp.com/en/contact-us/`.
4. Allianz Online Claims Tracker: personalized access, browser/cross-device availability
   and a small explicit lifecycle vocabulary; private tracker content is blocked without a
   customer link. Source:
   `https://www.allianz.pl/en_PL/individuals/landing-pages/online-claims-tracker-usage.html`.

Comparison criteria are authentication timing, zero-re-entry fidelity, cross-session
access, lifecycle/manage/delete clarity, privacy truth and continued anonymous usefulness.
The benchmark informs principles only: do not copy operator words, page structure,
branding, illustration, interaction sequence or distinctive trade dress.

## Accessibility and responsive contract

- Inline OTP/manage regions have programmatic headings and focus moves only after a
  deliberate open, successful verification, resume, conflict or delete confirmation.
- Status uses polite live regions; errors use alerts; email/code fields have explicit
  labels, descriptions, invalid state and masked destination; code supports
  `one-time-code` and numeric input.
- Every action is keyboard reachable with a visible focus indicator and at least 44 px
  target height. Confirmation never relies on color alone.
- Mobile widths 320/360/390/430 px use one column; desktop 1280/1440 px keeps the existing
  organizer proportions. No horizontal overflow at 200% zoom or WCAG text spacing.
- Reduced motion and forced colors remain usable. Delete confirmation and pagination keep
  logical focus order.
- With JavaScript disabled, no save control or durable-success promise is rendered; the
  existing readable Free Start fallback and temporary-state truth remain visible.
- SQ/EN/SR/MK are required. German is excluded.

## Acceptance evidence inventory

- Durable store: `free_start_drafts`, containing only the accepted data contract.
- Isolation proof: live PostgreSQL RLS tests for missing actor, same-tenant/wrong-owner,
  wrong access tenant, rejected owner/tenant insert and 101-owner concurrency.
- Lifecycle proof: content-free `audit_log` rows for created, updated, resumed and deleted;
  each mutation audit is in the same transaction as the fact-row change.
- Auth proof: existing neutral Better Auth OTP contract tests plus anonymous action denial,
  test-only `P00` stable-owner precondition, authenticated owner success and same-account
  second-context E2E.
- Zero-re-entry proof: all six normalized facts returned by a successful save equal all six
  restored facts after session teardown, a new authenticated browser context and resume;
  no raw-whitespace preservation claim is made.
- Delete proof: row absent, list absent, subsequent resume generic-not-found, audit contains
  no draft content.
- UI proof: SQ/EN/SR/MK component and Playwright matrices, mobile/desktop/200% zoom/text
  spacing, keyboard/focus, reduced motion, forced colors and no-JS truth.
- Scale proof: 101 isolated concurrent draft creates/reads plus stable pagination and
  compare-and-swap conflict tests.
- No external provider state, upload, claim, case, membership, billing or domain event is
  acceptance evidence for this slice.

## Exact acceptance cases C01–C36

- C01–C06: strict partial schema, empty rejection, exact vehicle/property issue-matrix
  acceptance, injury and unknown/health-field rejection, multilingual exact-token
  medical-spill rejection plus acceptance of every unlisted token, and exact idempotent
  text/date normalization.
- C07–C12: anonymous denial, exact neutral-host denial, missing session tenant denial,
  server-derived actor/tenant authority, generic wrong-owner response, different-email
  non-enumeration.
- C13–C18: migration/schema/index/check constraints, actor+access RLS including a direct
  query with the application owner predicate deliberately omitted that still returns only
  the RLS actor's row, same-tenant owner isolation, cross-tenant denial, owner FK default
  no-action user-delete proof, content-free audit shape.
- C19–C24: idempotent create, 200-draft limit under concurrent create, ordered pagination,
  six-fact resume, compare-and-swap one-winner race, atomic hard delete.
- C25–C30: inline OTP intent retry, dirty/saved/conflict UI, start-another identity reset,
  delete confirmation/focus, SQ/EN/SR/MK parity and forbidden-copy scan, no-JS temporary
  truth.
- C31–C36: same-account new-context resume, 101-owner isolation stress, mobile/desktop and
  200% zoom/text spacing, Chromium/Firefox/WebKit, keyboard/screen-reader semantics, clean
  browser console/network with unchanged anonymous completion.

## Exact implementation map and ceiling

The protected addendum owns files 1–14. Files 15–30 are the only non-protected production,
configuration or locale allocation:

1. `packages/database/src/schema/free-start-drafts.ts`
2. `packages/database/src/schema/index.ts`
3. `packages/database/drizzle/0092_ida_free_start_drafts.sql`
4. `packages/database/drizzle/meta/_journal.json`
5. `packages/database/drizzle/meta/0092_snapshot.json`
6. `packages/database/package.json`
7. `packages/database/src/free-start-drafts.ts`
8. `packages/database/src/free-start-drafts/contracts.ts`
9. `packages/database/src/free-start-drafts/context.ts`
10. `packages/database/src/free-start-drafts/create.ts`
11. `packages/database/src/free-start-drafts/read.ts`
12. `packages/database/src/free-start-drafts/mutate.ts`
13. `apps/web/src/components/auth/use-neutral-email-otp.ts`
14. `apps/web/src/components/pricing/pricing-table/use-pricing-email-otp.ts`
15. `apps/web/src/lib/validators/free-start-draft.ts`
16. `apps/web/src/actions/free-start-drafts.ts`
17. `apps/web/src/actions/free-start-drafts/session.core.ts`
18. `apps/web/src/actions/free-start-drafts/lifecycle.core.ts`
19. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/index.tsx`
20. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/types.ts`
21. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-draft-lifecycle.ts`
22. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/secure-save-band.tsx`
23. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/secure-save-otp.tsx`
24. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/saved-draft-list.tsx`
25. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/delete-draft-confirmation.tsx`
26. `apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-organizer-flow.ts`
27. `apps/web/src/messages/sq/freeStart.json`
28. `apps/web/src/messages/en/freeStart.json`
29. `apps/web/src/messages/sr/freeStart.json`
30. `apps/web/src/messages/mk/freeStart.json`

This allocation gives four focused UI components, one lifecycle hook, two action cores and
four repository modules while retaining the four locale files. No five-state-by-four-locale
code duplication is planned: states are typed once and copy is keyed in the existing locale
files. The current 146-line organizer entry must shrink through composition; the current
150-line pricing hook becomes a typed wrapper. Each new or substantially refactored
production file is at most 150 lines, so the two ceilings are jointly satisfiable.

Hard ceiling: exactly the 30 allocated production/config/migration/i18n files above, at
most 15 test/spec/support files, exactly C01–C36 plus the test-only precondition `P00`, and
seven engineering days. Any extra file requires a new hash-bound review; functionality is
not compressed into an over-limit file. The future 151–160 policy is not active.
Dependencies are unchanged.

## Failure, abuse, operations and rollback

- Payloads are strict, length-bounded and authenticated. Owner/tenant/id fields are never
  accepted from client authority. UUIDs and generic errors prevent sequential enumeration.
- The medical-term screen is deterministic, local, non-logging and limited to the accepted
  term list. It never calls a model/provider, records a match or claims semantic coverage.
- Pending client operations are one-shot locked. Durable create idempotency and update CAS
  handle retries, double clicks, stale tabs and ordinary network ambiguity.
- Database/auth/audit failure rolls the save/update/delete transaction back. The public
  organizer remains usable and displays no false success.
- The 200-active-drafts-per-owner cap bounds per-owner storage abuse while leaving the
  requested 100+ proof room. Many verified-email accounts remain a disclosed residual
  bounded only by existing OTP controls; this slice adds no global quota/provider.
  No Redis/provider, queue, webhook, email beyond existing OTP, cron or deployment resource
  is added.
- Content-free server error categories may identify operation/outcome only. No email,
  summary, category facts, OTP, session token or raw database error is logged.
- No new dashboard or support data viewer is added. Existing audit/operator tooling is the
  only diagnostic store; customer recovery is retry, same-email sign-in, manage or support.
- Resume intentionally writes one content-free audit event in the same transaction as its
  read. That excludes replica-only reads and can grow audit history; both are accepted for
  forensic lifecycle truth in this bounded slice.
- Rollout is not authorized. Future deployment must apply the additive migration before
  exposing the save UI. Missing-table behavior degrades to unavailable without breaking
  anonymous Free Start.
- Code rollback removes the UI/actions while leaving the isolated table dormant. Destructive
  migration rollback is unnecessary; existing rows remain protected until an explicit
  deletion/migration decision.

## Reviewer matrix and stop conditions

- `atlas`: architecture/session/shared-boundary preservation.
- `sentinel` + `security_reviewer`: owner/access RLS, host/session fail-closed behavior,
  privacy, enumeration, audit and abuse/race review.
- `architect_reviewer`: exact schema and transaction/CAS/idempotency design.
- `performance_reviewer`: 101-owner stress, index/pagination and storage cap.
- `contracts_reviewer`: six-fact schema, lifecycle truth and excluded health/upload fields.
- `qa_reviewer` + `gatekeeper`: C01–C36 allocation, DB migration/RLS, E2E and mandatory gates.
- `pixel` advisory only: premium visual continuity, mobile, focus and deletion states.
- `scribe`: docs-only promotion and later closeout consistency.
- Required external design signals: bounded Sonnet 4.6 and Gemini 3.1 Pro Preview; Opus 4.8
  escalation because schema/RLS/auth/privacy are protected. Reviewers are advisory; repo
  authority and gates remain final.

STOP before product edits if the protected addendum is absent/mismatched, the resolver does
not select only `IDA-UI03a1`, owner-level RLS requires changing shared tenant architecture,
the current neutral OTP contract cannot be reused without route/provider changes, health or
upload persistence becomes required, audit cannot be atomic/content-free, or any excluded
surface is needed. `P00` failure to prove one stable Better Auth user id for two completed
same-email sign-ins is also STOP before schema/migration/product edits and does not permit
account recovery work. Material file/case/day expansion also returns to an exact addendum.

At delegated acceptance, the parent-side `binding_receipt` named in front matter records
both final reviewed SHA-256 digests. The addendum still embeds this parent's exact digest.
This detached manifest is the reciprocal binding: embedding each final digest inside the
other document would create an unsatisfiable circular hash dependency.

## Exclusions

`IDA-UI03a2` member-claim handoff; `IDA-UI03b` different-email recovery;
`IDA-UI03a0c` Paddle correlation; uploads/documents/compression; injury/health persistence;
German; dashboards; full redesign; claim/case creation; generated-result persistence;
eligibility, coverage or legal advice; proxy/canonical routes; auth/session architecture;
shared-auth public API; broad tenancy/routing; Paddle/billing; Supabase/provider resources;
cron/queues/webhooks; deployment/aliases; README, AGENTS and broad architecture docs; all
other unpromoted slices.
