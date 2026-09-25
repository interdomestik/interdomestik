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

`STAGING-READINESS-RECOVERY` is the sole active bounded repair, authorized by the owner after
recurring staging failures blocked #1822. Base is protected main
`e0cbdf1548fc5968f6714dbf68d630eb44dd4722`. Fix the mounted health probe's missing call into existing
RLS timeout recovery and remove the deployment deadlock caused by requiring the previous target
to be healthy before capturing its identity. Do not relax RLS posture or replacement health gates.

PR [#1822](https://github.com/interdomestik/interdomestik/pull/1822) merged the exact saved-draft
continuation, including expired-session recovery, with protected current-head proof. Its immutable
preview reported exact-main healthy; CD [#36103643236](https://github.com/interdomestik/interdomestik/actions/runs/36103643236)
failed before alias movement because the previous deployment returned database-readiness HTTP 503.
Canonical staging/browser acceptance remains pending this repair. The continuation preserves
membership refusal; fresh-account first submission still requires S6 activation (`IDA-MEM-006`).
Whole S5/S6, business acceptance and production deployment remain outside scope.

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
remain credited, as do #1814 request-linked upload/acknowledgement and #1815 membership disclosure.
They do not establish new-account activation, request fulfilment, whole S5/S6/S7 or pilot admission.

## Program Goals

1. Let health-only traffic invoke the existing fail-closed RLS readiness recovery after a settled
   timeout; preserve cooldown, single-flight behavior and permanent unsafe-role rejection.
2. Capture the owned previous immutable deployment's identity from validated static staging release
   metadata, separately recording runtime health. Missing/conflicting identity remains a blocker.
3. Require the replacement's exact-SHA immutable health before alias mutation and strict immutable,
   canonical health and provider mapping afterwards. Preserve serialized CD and durable receipts.
4. Restore a previous target only after fresh exact health; an unavailable rollback stays explicitly
   failed without moving to an unhealthy target. Verify protected main staging and existing P0 gate.

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

Continue the owner-adopted outcome order without rebuilding delivered behavior: the active staging-readiness repair completing
#1822 staging acceptance, remaining S5 gaps, remaining S6 acceptance after the delivered
#1815 disclosure, S7 staff handling, S8 agent handoff, S9 assisted activation, S10 branch oversight,
S11 tenant administration, S12 platform operations and S13 outcome/closure, followed by S14
whole-pilot rehearsal. H1 Help Now keeps its priority lane when its direct dependencies are ready.

Direct dependencies remain local to their consumers. PR #1814 proves request-bound upload and
assigned-staff acknowledgement; PR #1815 proves the bounded member lifecycle/access disclosure.
This slice consumes existing secure-save, member draft, auth, tenant and audit boundaries but
does not re-prove their delivered outcomes or prove provider confirmation, webhook/payment
readiness, offer or activation acceptance. Reviewed signed/versioned/integrity/expiry
contracts precede offline pack readiness; S8 precedes dependent S9; recovery, partner, mandate,
consent and billing receipts precede affected S13 promises. T-411 keeps its T-401, SVC-CORE and
FLIGHT-03 dependency chain. No whole-overlay or stale historical row becomes a blanket pilot gate.

Pilot admission still requires the applicable role journeys, EN/SQ/MK/SR coverage, complete-process
accessibility evidence, truthful contract-backed copy, tenant/role/privacy/data-integrity checks,
operational ownership, incident/restore evidence and explicit release authorization. CI success
alone is not business or user acceptance.

## Current Repair Acceptance

### Current staging recovery acceptance

- A real readiness regression reproduces timeout → cached health failure, then verifies recovery
  through health requests alone after SQL settlement/cooldown, including concurrent requests.
- No liveness query runs while posture is unresolved or unsafe. No new retryable error class,
  tenant bypass, admin fallback, schema or auth change is introduced.
- Unhealthy old runtime plus valid owned staging metadata permits preparing a healthy replacement;
  malformed/foreign/mismatched identity and unhealthy/wrong-SHA replacement fail before movement.
- Exact new immutable and canonical health remain mandatory after movement. Rollback rechecks the
  old target and never claims restoration when it cannot safely restore.
- Final focused, security, protected hosted and exact-main staging P0 evidence bind to the repair;
  prior #1822 source proof remains credited, not substituted for changed inputs.

### Credited #1822 product acceptance (canonical staging pending)

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

Recovery investigation checked 2026-09-25 against current source and historical exact-deployment
logs. The previous instance emitted `RlsRolePostureTimeoutError`; mounted health bypassed the
asynchronous readiness entry point used by tenant requests. This integration omission is reproduced
by the new regression; logs alone do not identify whether different events share one instance.
[Official Vercel CLI log implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/logs-v2.ts)
provided the bounded historical read API. [Postgres.js connection documentation](https://github.com/porsager/postgres/blob/master/README.md)
explains lazy reconnect on a later query; preserve the existing narrow timeout recovery instead of
broadening retries speculatively. Static metadata establishes owned immutable identity, not runtime
health or independent cryptographic verification. Existing CD digest verification stays mandatory.

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
