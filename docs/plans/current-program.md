---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-24
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document defines the current phase, priority, sequencing and ordinary delivery
> contract. Detailed completed proof is historical and linked below rather than repeated here.

## Current Phase

`S5-LOCAL-DRAFT-DISCLOSURE` is the sole active product implementation. The owner authorized the
bounded `IDA-FST-004` increment on the neutral public organizer: before any new browser persistence,
show an EN/SQ/MK/SR disclosure covering shared-device risk, eligible and excluded data, 30-day
expiry, deletion and the separate verified-email secure-save path. A person may explicitly enable
browser recovery or continue without device storage; either path keeps the organizer usable and
creates no claim, case, membership, payment or handoff side effect. The slice starts from protected
main SHA `6fbf6a5537613baac12d84b035d3ce8734a9010c`.

Protected PR [#1816](https://github.com/interdomestik/interdomestik/pull/1816) merged as that SHA.
Its authorized manual read-only diagnostic run
[#36003798077](https://github.com/interdomestik/interdomestik/actions/runs/36003798077) verified the
exact PR #1803 immutable preview and reported `panel-visible`. This closes the bounded diagnostic;
it did not mutate roles, retry staging, identify a root cause, establish pilot admission or authorize
production. The automatic exact-main CD run #36003653726 passed staging P0.3/P0.4 and skipped every
production job; that is staging evidence only.

The earlier P0.3/P0.4 staging-evidence gap is replaced only for the tested staging boundary by
artifact `staging-verification-35784351048` from successful CD run
[#35784351048](https://github.com/interdomestik/interdomestik/actions/runs/35784351048) on exact SHA
`c8f8834434a64962f042356721fa7657f7cc6253`. That artifact is staging evidence; it is not production
evidence, pilot admission or user acceptance.

The request-linked member evidence predecessor completed through protected PR
[#1814](https://github.com/interdomestik/interdomestik/pull/1814) as
`af191e71da589307a21df2a7fce14380a1fdd625`. The bounded member lifecycle/access disclosure then
completed through protected PR [#1815](https://github.com/interdomestik/interdomestik/pull/1815) as
`966a774028dc113757c298876e442e1ae80c73b5`. Those increments remain credited, while request
fulfilment, whole membership acceptance and the broader S5/S6 families remain open.

Product implementation resumed with this bounded S5/S7 dependency. Completed increments through
S5 first-case saved-draft continuity [#1801](https://github.com/interdomestik/interdomestik/pull/1801)
remain credited; whole S5 and the other SRS requirement families named below remain open.

## Program Goals

1. Explain the browser-local choice before a fresh eligible draft can be written, including
   shared-browser risk, vehicle/property eligibility, injury/document exclusion and 30-day expiry.
2. Offer equally usable explicit opt-in and no-device-save paths, with a reversible no-save choice
   and truthful status feedback in EN/SQ/MK/SR.
3. Preserve expiry, discard, stale-tab/conflict and secure-save behavior; remove the local copy only
   after confirmed verified-email secure save, never merely after viewing the disclosure.
4. Keep review before any later handoff and prove the disclosure itself creates no account, claim,
   case, membership, payment, CRM lead or server-side draft.

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
S5 local-draft disclosure, remaining S5 gaps, remaining S6 acceptance after the delivered
#1815 disclosure, S7 staff handling, S8 agent handoff, S9 assisted activation, S10 branch oversight,
S11 tenant administration, S12 platform operations and S13 outcome/closure, followed by S14
whole-pilot rehearsal. H1 Help Now keeps its priority lane when its direct dependencies are ready.

Direct dependencies remain local to their consumers. PR #1814 proves request-bound upload and
assigned-staff acknowledgement; PR #1815 proves the bounded member lifecycle/access disclosure.
This slice consumes the existing anonymous-draft, secure-save, auth, tenant and audit boundaries but
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

### Current product acceptance

- On a fresh neutral organizer, no new local draft is written until the person chooses browser
  recovery. Continuing without device storage remains reversible and keeps editing available.
- Before opt-in or resuming an existing local copy, mounted EN/SQ/MK/SR copy clearly covers
  shared-device risk, eligible and excluded facts, expiry, deletion and verified-email secure save.
- Existing expiry, discard, retry, stale-tab/conflict and secure-save semantics remain intact. A
  local copy is removed only after confirmed secure save or explicit device discard.
- The mounted flow remains keyboard/focus/responsive accessible, review precedes any later handoff,
  and neither disclosure choice creates server-side or commercial side effects.

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
  or CRM lead is created. Whole S5, `IDA-FST-004`, operations and user acceptance remain open.
- Focused contracts, independent high-risk review, `pnpm pr:verify`, `pnpm security:guard` and
  protected current-head checks pass before delivery. No whole-SRS, pilot-readiness,
  user-acceptance or production-deployment claim follows.

## Bounded Research Brief

Checked 2026-09-24. Observable official guidance supports disclosure before storage and an explicit
shared-device warning: the UK ICO treats non-essential browser storage, including local storage, as
requiring prior consent, while the UK NCSC advises people on shared devices not to save sensitive
information. W3C status-message guidance supports visible programmatic feedback without moving
focus, and ADAC's public claims journey confirms that save-and-continue-later is a recognizable
insurance pattern. Adopted inference: default to no new local write, provide an in-page opt-in/no-save
choice, keep status feedback announced, and leave secure save as a separate verified-email action.
Rejected: implied consent, a blocking modal, persisting injury/document data, or representing local
storage as secure server save. User benefit and test: a person can understand and reverse the choice;
mounted locale and browser tests prove no write before opt-in, no-save truthfulness, later enablement
and complete disclosure copy. Sources: [ICO storage and access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/),
[NCSC shared-device guidance](https://www.ncsc.gov.uk/guidance/shopping-online-securely),
[W3C status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html), and
[ADAC claims service](https://www.adac.de/produkte/versicherungen/schadenservice/).

## Historical Evidence

- [Program ledger through PR #1807](history/2026-09-22-current-program-ledger.md)
- [Tracker and proof ledger through PR #1807](history/2026-09-22-current-tracker-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

These records are immutable evidence inputs, not active queues. The retired Lean projection and
slice runners remain explicit-only and cannot select or block ordinary owner-authorized work.
