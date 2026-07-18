# IDA-UI03a1 closeout — verified secure Free Start drafts

## Outcome

`IDA-UI03a1` is complete. The neutral pre-membership vehicle/property Free Start
organizer now offers an optional, deliberate secure-save path through the
existing neutral Better Auth email OTP boundary. The same verified owner can
resume all six normalized organizer facts in a later session or device without
re-entering them, review saved drafts, resolve version conflicts and permanently
delete a selected draft.

Anonymous use and the existing temporary generated result remain available.
Secure save does not claim membership, payment, claim acceptance, document
storage or automatic transfer. Draft facts remain until the owner explicitly
deletes the draft; this slice makes no account/user deletion, automatic expiry
or scheduled purge promise.

## Authority and merge

- Parent design `IDA-DG18`: SHA-256
  `1138cb80e9def6fbbe041f333dcee16269bed9a8a95dabb00f2084ec467e1e78`.
- Protected addendum `IDA-DG18A`: SHA-256
  `972c307c4400722ff45fbc086400afc0202f878f173ee9a6e8a6a66cb6db1061`.
- Detached server-propagation addendum `IDA-DG18B`: SHA-256
  `a592b881f2fa7e7e2ca2714ce9ceaa97cbe3b4e97d8ff43147ab5662b8fb0449`.
- Detached UUID/truth-copy addendum `IDA-DG18C`: SHA-256
  `43ee33aa64950d5fb3e1ea709ba5313984294d39f55b07ab0e99d9638c550e53`.
- Canonical promotion merge: `84430980e5dd8306a5df56595f78fe836e785db1`.
- Implementation PR: [#1376](https://github.com/interdomestik/interdomestik/pull/1376).
- Final implementation head: `1f7359edcc10f287596c4d36d29bb6e54192e728`.
- Merge-main SHA: `8254549a284a4d8d8584e22f7d7d8f4cd6327b3b`.
- No replacement implementation slice is promoted. After this closeout the
  resolver must return `blocked_requires_current_authority` with
  `activeSlice=null`.

## Scope and preserved architecture

P00 passed first against the real local Better Auth/Postgres adapter: two
completed same-email neutral OTP sign-ins produced one stable user id and one
`"user"` row. Product and schema work began only after that fail-closed
precondition and post-promotion main CI, Sonar and CodeQL were green.

The final implementation diff uses the exact cumulative 35
production/config/migration/i18n files and 15 test/spec/support files authorized
by DG18, DG18A, DG18B, DG18C and the separate deterministic metadata
authorization. `scripts/repo-size-budget.json` was updated only by the unchanged
generator. C01-C36 plus P00 and the seven-engineering-day ceiling remain exact;
every new or refactored production file is at most 150 lines. The generated
Drizzle snapshot is generated metadata, not hand-authored production logic.

Supabase Auth remains the identity/session system of record, Better Auth remains
the active orchestrator and `@interdomestik/shared-auth` remains the
provider-agnostic boundary. The page resolves the canonical default public
tenant once on the server and passes it only through the dedicated mandatory
neutral-OTP hint. The client cannot derive, replace or fall back from that
authority. The authoritative fresh-session access tenant must match the
independently resolved neutral home or the operation fails closed.

No `proxy.ts`, canonical route, shared-auth public API, session/tenancy
architecture, Paddle/payment, provider resource, dashboard, upload/document,
compression, injury/health persistence, German, rollout, deployment or
production alias changed. Later explicit M0-M5 classification remains deferred.

## Security, lifecycle and data proof

- The new `free_start_drafts` boundary stores only the six normalized approved
  facts plus lifecycle metadata; dedicated medical/injury, upload, document,
  classification, membership and payment fields are absent.
- Strict validation bounds categories, lengths, UUIDs and the accepted fixed
  whole-token summary spill screen. It does not invent a broader semantic
  counterparty filter outside the accepted DG18A contract.
- Tenant and owner RLS deny missing context, peer-owner access and cross-tenant
  reads/writes. Live proof covers 101 isolated owners and all 41 required RLS
  checks.
- Create is idempotent, owner capacity is serialized, list order/pagination is
  deterministic and optimistic version compare-and-swap rejects stale updates.
- Create, resume, update and owner-requested hard delete write content-free audit
  rows atomically. Direct client audit insertion is denied.
- `owner_user_id` references `"user"(id)` with default no-action delete behavior;
  owner-requested draft hard delete is required and proved. Broader account
  deletion or audit anonymization remains separately governed.
- UUIDv4 submission keys use only `globalThis.crypto.getRandomValues`; there is
  no polyfill, fallback dependency or changed key lifecycle.

## Verification

- `pnpm pr:verify`: PASS on final head; 3,034 tests passed, repository line
  coverage was 85.10%, live RLS was 41/41, the gate lane was 205 passed with 9
  contracted skips, and smoke was 13 passed with 11 contracted skips.
- Standalone `pnpm e2e:gate`: PASS, 205 passed and 9 contracted skips.
- The authoritative neutral-IDA host lane passed 6/6, including C31 real
  HTTP-localhost save, fresh same-account session, six-fact zero-reentry resume
  and permanent delete without the removed UUID shim.
- `pnpm security:guard`: PASS. Repository size, migration journal, type, lint,
  architecture, DB access, i18n/purity, coverage and focused unit/RLS lanes were
  green.
- Post-merge `main@8254549a` passed CI `29638455075`, including its DB-backed
  E2E gate, Sonar Main Gate `29638455080`, CodeQL `29638454949` and Secret Scan
  `29638455088`.

## Visual, accessibility and review disposition

Independent Codex 5.6 Sol XHigh localhost acceptance returned ACCEPT on the
final behavior. Its proof covers SQ/EN/SR/MK copy, desktop/mobile responsive
layouts, keyboard and visible focus, screen-reader status/labels, 200% zoom,
WCAG text spacing, forced colors, reduced motion, JavaScript-on/off and the
configured browser lanes. The exact Chromium gate passed 1/1 and the focused
lifecycle/copy lane passed 21/21. No visual or accessibility blocker remained.

Independent Tier-3 database/RLS/security review returned READY on final head.
The final DB rerun passed 41/41 with serialized RLS execution. Copilot reviewed
49 of 50 files and its current-head pass generated no new comments; all seven
review threads are resolved. GitHub Codex failed before analysis because its
external quota was exceeded, so the independently delegated Sol XHigh security
review served as the recorded fallback and found no blocker or hardening issue.
Sonar reported no blocking issue; CodeQL, Semgrep, OSV, gitleaks, pnpm audit,
reviewdog and `pr-finalizer` were green.

## Deployment, residuals and Brain measurement

Automatic CD run `29638455077` was cancelled immediately after merge while
Docker Buildx was still setting up. Registry login, metadata, image build,
staging deploy, production evidence/build/deploy and production verification
were skipped or cancelled. The Vercel context failed on the existing private
organization/Hobby-plan restriction. No deployment, environment URL or alias
change occurred.

The current-head save-change state review raised one nonblocking UX hardening
idea for conflict/account-context/unsupported states. Server authority,
validation and optimistic concurrency already reject unsafe transitions, no
false saved claim is shown, and the final accepted behavior remains within the
exact gate. No later-slice commitment is created by that advisory.

Brain and Obsidian were queried as advisory context. They remained stale for
this exact UI03a1 lifecycle and did not contradict canonical repository
authority. Repository program/tracker/resolver, accepted hashes and live proof
therefore governed the work. No full-task time/token savings or `humanUseful`
claim is made; usefulness remains `unknown/not_confirmed` until Arben labels it.

## Closeout and next action

The canonical program and tracker consume the sole `IDA-UI03a1` promotion.
`IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, uploads/documents/compression,
injury/health persistence, German, dashboards/full redesign and every other
follow-on remain unpromoted. A fresh current-authority/design gate and separate
exact authority are required before any follow-on implementation. Expected
resolver state is `blocked_requires_current_authority`, `activeSlice=null`.
