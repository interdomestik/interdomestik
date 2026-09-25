---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-25
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document defines the current phase, priority, sequencing and ordinary delivery
> contract. Detailed completed proof is historical and linked below rather than repeated here.

## Current Phase

`S6-MEMBER-CONFIRMATION-SAFETY` is the sole active bounded product increment, selected under the
owner's standing implementation/merge/staging authorization. Base is protected main
`d5e657da2ed88ac94db93cf4cc55343718c08e08`. A signed `subscription.created` currently sends a
welcome email and PDF for every provider status, fills missing price/date/member values with local
fallbacks, forces English and advertises unverified benefits, refund and protection claims. Make
confirmation fail closed unless Paddle reports an active membership with complete provider/member
values, then send truthful EN/SQ/MK/SR next steps to the tenant-localized membership route. This is
bounded IDA-MEM-006 confirmation safety, not an approved offer/terms package, delivery ledger,
automatic entitlement or whole IDA-MEM-006/007 acceptance.

PR [#1825](https://github.com/interdomestik/interdomestik/pull/1825) delivered the signed-in
plan/entity checkout review as protected merge `d5e657da2ed88ac94db93cf4cc55343718c08e08`.
Its [receipt](https://github.com/interdomestik/interdomestik/pull/1825#issuecomment-5834108770)
records required local/protected checks and automatic staging CD `36145768095` with exact-main
health and P0.1/P0.2/P0.3/P0.4/P0.6 passing. Production jobs were skipped. Credit that
presentation-only correction; do not redo its proof or infer terms acceptance, live activation,
whole S6 or user acceptance.

PR [#1824](https://github.com/interdomestik/interdomestik/pull/1824) delivered safe, exact retry of
entity-routed Paddle activation after out-of-order transaction evidence. Its
[receipt](https://github.com/interdomestik/interdomestik/pull/1824#issuecomment-5831196011) records
protected merge `c020c20`, 292 gate and 24 smoke passes, and automatic staging CD `36124511981`
with exact-main health and P0.1/P0.2/P0.3/P0.4/P0.6 passing. Production jobs were skipped.
Credit this bounded fix, not live activation or whole IDA-MEM-006/007 acceptance.

PR [#1823](https://github.com/interdomestik/interdomestik/pull/1823) completed the prior staging
readiness repair on exact main `369bbd0987fab894958f125492aa3df909ecb196`. Protected checks and
automatic staging CD [#36111178342](https://github.com/interdomestik/interdomestik/actions/runs/36111178342)
passed immutable/canonical health and P0.1/P0.2/P0.3/P0.4/P0.6; production stayed unchanged. This
also completes canonical staging for #1822's saved-draft continuation. Both repairs are credited and
closed. Fresh-account first submission still requires the bounded S6 dependency below; whole S5/S6,
business acceptance and production deployment remain outside scope.

PR [#1817](https://github.com/interdomestik/interdomestik/pull/1817) delivered the bounded
`IDA-FST-004` local disclosure as `a5dd1e455628b7c9826c80683237adcbd0d2d4f3`. Following the separate
cached RLS posture-timeout recovery in PR [#1821](https://github.com/interdomestik/interdomestik/pull/1821),
automatic staging run [#36088924719](https://github.com/interdomestik/interdomestik/actions/runs/36088924719)
passed on exact main `9a51d469481a5843b415a5451ad246e51d54048b`, including P0.1/P0.2/P0.3/P0.4/P0.6.
Canonical health established the exact SHA; the release report's metadata probe remained `unknown`.
Production jobs were skipped. The prior task retired its owned worktree and preserved its
[handoff](https://github.com/interdomestik/interdomestik/pull/1817#issuecomment-5826423914).
The disclosure and diagnostic/recovery work are credited and are not active slices.

Earlier #1801 active-member submit/reopen and #1803 new-account OTP save/return/delete proofs
remain credited, as do #1814 request-linked upload/acknowledgement, #1815 membership disclosure and
#1825 checkout review.
They do not establish new-account activation, request fulfilment, whole S5/S6/S7 or pilot admission.

## Program Goals

1. Dispatch membership confirmation only for an exact signed Paddle `subscription.created` whose
   provider status is active and whose customer-visible plan, amount/currency, billing cadence,
   billing period and authoritative member values are complete.
2. Carry the validated checkout locale through provider custom data and render EN/SQ/MK/SR copy
   with the tenant-localized membership route and a separate saved-case submission step.
3. Remove the inaccurate generated PDF and fail closed for non-active states, missing values,
   foreign tenant context, duplicate receipts and unsafe manual reconstruction/resend.
4. Do not invent benefits, coverage, refunds, price/date/member fallbacks, offer or terms approval,
   a delivery receipt, entitlement, case submission or user acceptance.

## Enduring Safety Boundaries

- `apps/web/src/proxy.ts` remains the sole routing, access-control and tenant-isolation authority
  and is read-only unless the owner explicitly authorizes a justified change.
- Canonical routes `/member`, `/agent`, `/staff` and `/admin` must not be renamed or bypassed.
  Contractual `page-ready` and `*-page-ready` markers remain enforced.
- Supabase Auth remains the identity/session system of record, `better-auth` the orchestrator and
  `@interdomestik/shared-auth` the provider-agnostic boundary. Tenant/RLS and document lifecycle
  protections remain mandatory. Authentication must never be bypassed, including in development.
- Paddle remains the only V3 pilot billing provider. No routing, auth, tenancy, domain, schema,
  billing or deployment expansion is implied by a green check or planning entry.
- `README.md`, `AGENTS.md` and architecture documents change only on an explicit owner request. This
  governance repair carries that authorization only for its bounded owned files.
- Framework and dependency versions come from the workspace manifests, especially
  `apps/web/package.json`; prose must not duplicate a hard-coded framework version.
- Architecture-finalization work is conditional and follows
  [its program](architecture-finalization-program-2026-05-29.md) and
  [tracker](architecture-finalization-tracker-2026-05-29.md) only when explicitly promoted.

## Ordinary Product Delivery

- One bounded protected PR carries scope, acceptance, implementation and required tests. Routine
  promotion, qualification, closeout, status-only and bookkeeping-only PRs are not required.
- Focused feedback supports iteration. Runtime, security, CI/trust or other meaningful behavior
  changes still require `pnpm pr:verify` and `pnpm security:guard`; `pr:verify` includes E2E gate
  evidence for the same source, configuration and environment. Instruction-only work runs the
  current plan/contracts relevant to its changed surface. Protected hosted checks remain separate
  trust evidence and are not replaced by local receipts.
- `pnpm plan:audit` validates the active plan/tracker model and current safety contract. It does not
  parse retired Lean authority or reconstruct historical artifacts. `pnpm plan:audit:legacy` and
  `pnpm test:harness-v2` remain available for explicit legacy work.
- CI runs the retained shared delivery-safety tests on ordinary changes. Full legacy authority and
  Harness validation runs only when a legacy artifact, its actual consumer or its selection policy
  changes, or when explicitly invoked. Incomplete change evidence fails toward running legacy proof.
- `pnpm repo:size:check` growth is advisory except for the retained coarse largest-file and class-aware
  modularity limits. Ordinary source, test and catalog work needs no exact allocation, shared-budget
  update or byte-specific approval. Historical allocations remain evidence for their original work.
- Review the integrated current-head diff, substantive review bodies, inline findings and actionable
  check annotations. Consolidate accepted corrections before one expensive final verification lane.
  Do not transfer proof across changed source, configuration or environment identity.
- Record prepared, tested, merged, deployed and user-validated states separately. A merge never
  implies deployment or user acceptance.

## Model And Review Policy

- Use the least expensive capable owner for the demonstrated risk. GPT-5.6 Sol at appropriate
  reasoning is the normal integration owner; reserve Astra escalation for a concrete unresolved
  gate, security, concurrency, data-loss or cross-domain architecture ambiguity.
- Helper work must be bounded and disjoint. A routine deterministic change needs no fixed panel;
  one relevant subscription helper is sufficient when independent input is useful. Add a distinct
  second perspective for real cross-domain, security or concurrency risk.
- High-risk work retains independent review separate from implementation judgment. The reviewer is
  selected for the risk, not to satisfy a model-brand ritual.
- Reuse accepted helper/reviewer evidence until its inputs change. Verify the actually served model.
  Provider exhaustion may use an approved adequate alternative for low/medium risk without a routine
  waiver ceremony. Never retry solely to repair advisory formatting or use a paid API fallback.
- Helper output is evidence, not authority. Codex remains responsible for source inspection,
  executable tests, dispositions and final integration.

## Product Queue And Dependencies

The detailed SRS and architecture frontier lives in the
[requirement disposition map](requirement-disposition-map.md), which preserves all 510 numbered
clauses and supplementary controls. SRS v0.9 remains the reviewed baseline at SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`; repo/program and accepted
ADR authority control until explicitly amended.

Continue the owner-adopted outcome order without rebuilding delivered behavior: the active bounded
S6 provider-confirmation safety prerequisite for fresh-account S5 submission, remaining S5 gaps,
remaining S6 acceptance after the delivered #1815 disclosure and #1825 review, S7 staff handling,
S8 agent handoff, S9 assisted activation, S10 branch oversight, S11 tenant administration, S12
platform operations and S13 outcome/closure, followed by S14 whole-pilot rehearsal. H1 Help Now
keeps its priority lane when its direct dependencies are ready.

Direct dependencies remain local to their consumers. PR #1814 proves request-bound upload and
assigned-staff acknowledgement; PR #1815 proves the bounded member lifecycle/access disclosure.
This slice reuses #1824 provider-event reconciliation/dedupe and #1825 checkout locale/review. Approved
effective-dated offer/terms, immutable confirmation/delivery snapshots, delayed-onboarding localization,
safe resend/retry, live activation, renewal, invoice and payment-operations acceptance remain open.
Reviewed signed/versioned/integrity/expiry contracts precede offline pack readiness; S8 precedes
dependent S9; recovery, partner, mandate, consent and billing receipts precede affected S13 promises.
T-411 keeps its T-401, SVC-CORE and FLIGHT-03 dependency chain. No whole-overlay or stale historical
row becomes a blanket pilot gate.

Pilot admission still requires the applicable role journeys, EN/SQ/MK/SR coverage, complete-process
accessibility evidence, truthful contract-backed copy, tenant/role/privacy/data-integrity checks,
operational ownership, incident/restore evidence and explicit release authorization. CI success
alone is not business or user acceptance.

## Current Repair Acceptance

### Current S6 membership-confirmation safety acceptance

- The self-service checkout records only a validated EN/SQ/MK/SR locale in Paddle custom data; URL
  tenant values remain non-authoritative and the established signed webhook boundary is unchanged.
- Only `subscription.created` with exact provider status `active` and complete provider plan name,
  amount/currency, cadence and current billing period can dispatch active-membership confirmation.
  Trialing, past-due, paused, canceled/deleted and unknown states send no active confirmation.
- Missing locale, plan, price, period, member number/name/email or tenant-safe route sends no
  confirmation. No local price/date/member, plan, interval or locale fallback is permitted.
- The email renders truthful EN/SQ/MK/SR provider status/values and separate saved-case submission
  next steps. The prior unsourced benefits/refund/protection claims and generated PDF are removed.
  Manual resend remains disabled until an immutable provider confirmation snapshot exists.
- Existing verified transaction deferral, duplicate receipt short-circuiting and tenant-conflict
  failures occur before confirmation dispatch. Email delivery failure is not logged as success.
- Focused tests, independent integrated review, required verification and protected hosted checks
  precede merge; exact-main automatic staging is separately evidenced.
- No approved offer/terms, immutable delivery receipt, retry guarantee, automatic entitlement,
  case submission, whole IDA-MEM-006/007, user acceptance or production claim.

### Credited #1825 member checkout review acceptance

- Signed-in standard/family selection opens the existing focused plan/entity review before Paddle.
  Cancel restores focus; reselect and deliberate initialization retry retain the exact selected plan.
- Explicit continuation preserves configured identity/entity authority. Initialization locks controls;
  anonymous OTP, assisted business, pending-session and pilot controls remain unchanged.
- The exact-main staging receipt is credited above. No accepted terms/version/snapshot, live
  activation, whole S6, user acceptance or production claim followed.

### Credited #1824 provider-activation retry acceptance

- A verified entity-routed anonymous `subscription.created` whose related processed
  `transaction.completed` is not yet available fails before user/subscription writes and records a
  typed retryable result.
- Redelivery reclaims only the exact signature-valid failed row in the same entity processing
  scope and with the same payload hash. The compare-and-set permits at most one concurrent claimant.
- Reconciliation consumes only a signature-valid, successfully processed Paddle transaction from
  the same billing scope. Its customer ID must equal the subscription customer ID, and the
  entity-configured Paddle client must return that same active customer with a valid email.
  Missing/unsupported tenant context, archived customers, foreign ownership and conflicting
  provider metadata remain fail-closed and are never classified by error-message text.
- Once authoritative context exists, the established tenant-scoped writer creates or updates one
  subscription and preserves the current active/trialing lifecycle access contract. A later replay
  is a duplicate and performs no second entitlement, invoice, ledger or lifecycle event write.
- Browser success/query state remains non-authoritative. No schema, proxy, route, auth, RLS, price,
  offer, terms acceptance, entity snapshot or production configuration change is introduced.

### Credited #1822 product acceptance

- A clean confirmed, complete, preview-ready vehicle/property secure draft exposes one explicit continuation action with
  EN/SQ/MK/SR copy stating that membership and separate submission remain necessary. Dirty,
  pending, conflicted, failed or deleted drafts expose no continuation action.
- Only the opaque UUID travels in the URL fragment; no facts, authorization or entitlement travels
  with it. The existing canonical route/query, proxy, page-ready and membership checks are unchanged.
- The receiving intake resolves the exact ID through the existing authenticated resume action.
  Pending reads block editing. Invalid, missing, foreign and refused reads reveal no draft facts;
  generic failure and keyboard-accessible retry preserve the same ID and perform no writes.
- Successful load focuses the review heading. The existing manager-only membership explanation and
  disabled submit remain for an account without membership; an eligible member retains the existing
  deliberate-submit and idempotent confirmation behavior.
- The real-OTP journey continues the newly verified owner's exact saved facts in all four locales,
  retaining zero claims/subscriptions/CRM leads and exact cleanup. Existing owner/tenant isolation,
  save/return/delete and active-member submit/reopen evidence remains credited.
- Full new-account activation/submission, broader category journeys, complete-process accessibility,
  authorized business review and user/operational acceptance remain open. `IDA-MEM-006` requires a
  verified provider event or reconciled authoritative transaction, never a browser-success grant.

### Credited PR #1816 diagnostic acceptance

- The exact-preview health/SHA preflight verified PR #1803 SHA
  `12699481a1e1f3e231ca6c13844d4152125d02e4` in `preview`, then the sanitized browser receipt
  reported `panel-visible` in run #36003798077.
- The diagnostic permitted safe reads plus canonical login, blocked role and monitoring mutations,
  and made no staging retry or deployment claim. It is closed diagnostic evidence, not root-cause,
  production, pilot-admission or user-acceptance evidence.

### Credited PR #1803 acceptance

- The PR E2E lane runs a pinned Mailpit service on loopback. Only sign-in OTP mail opts into it;
  invalid or unavailable catcher configuration fails without falling back to an external provider.
- A native Chromium request from the explicit `ida.localhost` test origin verifies the delivered
  code, receives an HttpOnly session and persists the exact eligible facts. No request interception,
  Origin rewriting, CSRF/origin bypass or production trusted-origin expansion is permitted.
- A cookie-free, valid-code request from an untrusted Origin is rejected before rate limits or the
  Better Auth handler and does not consume the code; wrong-code and consumed-code replay attempts
  also fail closed. Retained Playwright trace, video and screenshot capture is disabled for this
  secret-bearing proof and errors redact every retrieved code.
- The verified owner can return in a fresh browser, resume exact facts and permanently delete the
  draft with create/delete audit evidence. A foreign tenant sees `notFound`; no claim, subscription
  or CRM lead is created. Whole S5, operations and user acceptance remain open; bounded `IDA-FST-004` delivery is credited above.
- Focused contracts, independent high-risk review, `pnpm pr:verify`, `pnpm security:guard` and
  protected current-head checks pass before delivery. No whole-SRS, pilot-readiness,
  user-acceptance or production-deployment claim follows.

## Bounded Research Brief

Checked 2026-09-25 against the installed Paddle SDK, signed webhook path and current SRS map.
[Paddle's `subscription.created` reference](https://developer.paddle.com/webhooks/subscriptions/subscription-created/)
defines provider status, customer-visible price name, lowest-denomination amount/currency, billing
cycle, current billing period and custom data on the signed event. Its active item status means the
item is not in trial; [Paddle's trial guidance](https://developer.paddle.com/build/trials/extend-activate-change-date-trials/)
separately states that checkout with a trial creates a `trialing` subscription and later changes it
to `active`. Adopt exact active-state gating and the provider/member values already present; reject
fallback reconstruction, trial-as-active confirmation, marketing/benefit claims and unsafe resend.
Expected benefit: a member receives a confirmation only when its displayed facts are traceable to
the signed provider state, with localized separate-case next steps. Test non-active/missing values,
four locales, out-of-order retry, duplicate receipt and tenant conflict. This does not approve the
commercial offer or prove mail delivery, provider operations or whole IDA-MEM-006/007.

G06's SHA-256 matches the release manifest, but its July T-503 ratification references MINSAS
terms (Lithuanian operator, Stripe/app stores) and MK conditions effective June 2021 (prorated refund,
registration activation). These do not resolve current Paddle pilot offer/version/effective-date
approval and conflict with current product behavior. Keep them historical; owner selection of a
current approved package remains required for actual terms capture. The owner reconfirmed Paddle-only.
Paddle business-model acceptance, the unresolved MK webhook secret and deployed entity-token
`customer.read` permission remain separate operations/business evidence, not delivered by this UI fix.

### Reused #1825 research

Checked 2026-09-25. [W3C financial error-prevention guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html)
supports reviewing/correcting before financial commitment. #1825 applied the existing review to
signed-in self-service members and retained cancel/reselect/retry proof without creating offer or
terms acceptance. Its exact-head and exact-main evidence remains credited and is not rerun here.

### Reused #1824 research

Checked 2026-09-25 against current source, installed manifests and the SRS v0.9 membership clauses.
[Paddle's webhook guide](https://developer.paddle.com/webhooks/about/how-webhooks-work/) says events
may arrive out of order and identifies `subscription.created` as the subscription-recording event and
`transaction.completed` as completion of provider processing. The
[subscription-created reference](https://developer.paddle.com/webhooks/subscriptions/subscription-created/)
binds that event to its causal `transaction_id`; Paddle signature verification remains mandatory.
[Paddle's get-customer reference](https://developer.paddle.com/api-reference/customers/get-customer/)
provides the authoritative customer email and active/archived status and requires `customer.read`;
current deployed entity-token permission is an unverified operations dependency, not a source claim.
The [Paddle error contract](https://developer.paddle.com/api-reference/about/errors/) distinguishes
retryable provider 5xx/rate-limit failures from permanent authentication, permission, validation and
not-found failures.
Adopt an exact, typed pre-write deferral plus compare-and-set retry. Reject generic failed-event retry,
browser-success activation, cross-scope transaction lookup, message-based error classification and
mutable tenant data as proof of checkout-time terms. Test focused failure/replay/isolation and retain
protected full verification. The expected benefit is recovery from documented provider event ordering
without duplicate entitlement; no complete `IDA-MEM-002`–`005` or whole-S6 claim follows.

### Reused saved-draft research

Checked 2026-09-25 against installed workspace manifests and the SRS v0.9 source clauses.
[ADAC's public online claims description](https://www.adac.de/produkte/versicherungen/autoversicherung/schaden/)
explicitly supports saving and continuing later; this is a public description, not an inspected
private account or usability test. The earlier generic ADAC URL was unavailable; the specific
claims page was verified instead. [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
supports programmatic loading/error feedback. Adopted inference: explicit exact-draft continuation,
localized loading/failure, blocked editing during load and review focus improve orientation without
implying case creation. Reject auto-submit, copied incident facts in URLs/storage, entitlement grants,
and new offer/payment semantics. Test through mounted four-locale controls, retry/negative cases and
the existing native-origin OTP browser proof. No framework behavior or version change is introduced.

## Historical Evidence

- [Program ledger through PR #1807](history/2026-09-22-current-program-ledger.md)
- [Tracker and proof ledger through PR #1807](history/2026-09-22-current-tracker-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

These records are immutable evidence inputs, not active queues. The retired Lean projection and
slice runners remain explicit-only and cannot select or block ordinary owner-authorized work.
