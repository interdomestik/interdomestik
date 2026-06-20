---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority correction/design-gate record. This
> document supports `current-program.md`, `current-tracker.md`, and the
> architecture tracker; it is not a source of truth by itself.

# OBR-DG15: T-404 AI Consent Prerequisite

## Classification

Classified as promotion/design-gate because this record only corrects current
plan and tracker authority after the `OBR-DG14` promotion exposed a missing
prerequisite for `T-404`. Risk tier: Tier 0 because this PR touches only docs
and tracker authority.

## Authority Correction

`OBR-DG14` correctly prohibited implicit default `AICallContext`, but it
promoted `T-404` before the repo had durable evidence that claim document AI
extraction callers can truthfully populate `AICallContext.consent:
required_granted` for `purpose: document_extraction`.

Current authority must therefore park `T-404` before implementation and promote
exactly one prerequisite: `T-404a AI document extraction consent boundary`.

`T-404a` is limited to defining how explicit `ai_document_extraction` consent is
captured, persisted, resolved by trusted server code, and exposed to queued
claim AI runs before `T-404` resumes. This gate does not authorize the
implementation; it only records that `T-404` is unsatisfiable without that
evidence.

## Revalidated Evidence

| Source                                                         | Evidence                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain-privacy/src/ai-call-context-purpose-rules.ts` | `document_extraction` is valid only when `processingPurpose` is `ai_document_extraction`, retention is `zero_retention_no_training`, and `consent` is `required_granted`; otherwise it adds `document_extraction_requires_consent`.                                                             |
| `packages/domain-privacy/src/ai.ts`                            | `AICallContext.consent` is a required `AICallConsentPosture`, and AI extraction policy always requires `ai_document_extraction` consent in addition to document-policy consent types.                                                                                                           |
| `packages/domain-claims/src/claims/ai-workflows.ts`            | The claim AI queue producer can justify trusted `tenantId`, `userId`, `claimId`, `documentId`, workflow, model, prompt version, storage path, and claim snapshot fields, but it does not receive or resolve durable `ai_document_extraction` consent evidence.                                  |
| `apps/web/src/messages/en/evidence.json`                       | The member evidence upload copy promises signed URL uploads, PII-tagged storage, privacy, and generic Terms/Privacy agreement. It does not ask for or name explicit `ai_document_extraction` consent.                                                                                           |
| `apps/web/src/features/member/claims/actions.ts`               | `generateUploadUrl` and `confirmUpload` require an authenticated session, tenant, and owned member claim before issuing or confirming claim evidence uploads, but they do not collect or pass AI extraction consent.                                                                            |
| `apps/web/src/features/claims/upload/server/shared-upload.ts`  | The shared upload path signs an upload intent, verifies tenant-scoped storage path and stored object metadata, persists `claimDocuments`, then calls `queueClaimDocumentAiWorkflows` with tenant/user/claim/document/file fields. This proves custody and ownership, not AI extraction consent. |
| `apps/web/src/features/member/claims/actions.test.ts`          | Existing proof covers owned-claim upload authorization, forged metadata rejection, storage metadata mismatch rejection, and queueing legal/evidence AI runs after metadata is saved. No test proves explicit `ai_document_extraction` consent.                                                  |
| Generic signup/legal copy                                      | Current generic Terms/Privacy acceptance remains supporting evidence only: it is not an explicit per-purpose consent event for queued claim document AI extraction.                                                                                                                             |
| `next-slice.mjs .` before this gate                            | Still resolved `T-404` as ready from `OBR-DG14`; this is the stale active-slice authority that DG15 corrects, not permission to implement runtime code.                                                                                                                                         |
| `workflow-scorecard.mjs .` before this gate                    | Reported Tier 3/T-404 implementation readiness from stale current authority. DG15 records that as expected pre-gate drift while keeping this PR Tier 0.                                                                                                                                         |
| Parked worker                                                  | Worktree `/Users/arbenlila/.codex/worktrees/c02f/interdomestik-crystal-home` on branch `codex/t-404-ai-context-required` is clean at `f71f4dd300f5fd851d7ea85b9d475ff540501659`, has no edits, and has no PR.                                                                                   |

## Why T-404 Is Currently Unsatisfiable

Future `T-404` must make `AICallContext` mandatory on `domain-ai` entry points
and reject missing context at runtime. For current claim document extraction
callers, a valid context for `purpose: document_extraction` cannot be
constructed unless the caller can prove:

- `processingPurpose: ai_document_extraction`;
- `retention: zero_retention_no_training`;
- `consent: required_granted`;
- trusted tenant, actor, subject, claim, and document scope.

The upload and queue path can supply trusted tenant/user/claim/document/workflow
fields. It also proves signed upload custody, owned-claim authorization, storage
path shape, and stored-object metadata. None of those facts are consent. The
current evidence copy and upload server path cannot supply consent without
fabricating it from signed upload custody, claim ownership, a generic
Terms/Privacy checkbox, or ambient tenant/session state. Stamping context later
in `domain-ai` would create the implicit default context that `OBR-DG14`
explicitly forbids.

## Candidate Ranking

| Rank | Candidate                                                                  | Decision   | Rationale                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-404a AI document extraction consent boundary`                           | Promote    | Smallest governed next action. It defines the explicit durable consent boundary needed before any queued claim AI extraction can truthfully populate `AICallContext.consent: required_granted`.                              |
| 2    | Narrow `T-404` to non-document-extraction callers only                     | Reject now | The current promoted acceptance is about every `domain-ai` entry point and current callers. Narrowing around the consent gap would leave the claim extraction boundary unresolved and risks hidden default-context behavior. |
| 3    | Jump to `T-403b` brand minting                                             | Defer      | Brand minting depends on a trusted consent resolver. Minting a brand without durable consent evidence only makes fabricated context harder to inspect.                                                                       |
| 4    | Jump to `T-405` broad caller codemod                                       | Defer      | Broad caller churn after the consent gap would spread placeholders or force artificial context values.                                                                                                                       |
| 5    | Jump to `T-406` ADRs                                                       | Defer      | ADR-08 should record proven mandatory-context and consent-boundary behavior, not a knowingly unsatisfied posture.                                                                                                            |
| 6    | Operational Brain runtime, prompts, model/provider calls, outbox AI events | Reject     | Runtime AI behavior is downstream and would increase blast radius before the consent authority exists.                                                                                                                       |

## Selected Next Action

Promote exactly one prerequisite slice:

`T-404a AI document extraction consent boundary`.

Future implementation must define, with focused proof, the smallest durable
representation and server resolver that lets queued claim AI document extraction
populate:

```ts
consent: 'required_granted';
```

only when explicit `ai_document_extraction` consent exists for the relevant
tenant, subject, claim/document scope, and processing purpose.

## T-404 Resume Evidence

`T-404` remains parked until all of the following evidence exists:

- durable explicit `ai_document_extraction` consent representation;
- trusted server resolver that maps that durable evidence to
  `AICallContext.consent: required_granted`;
- negative proof that missing, withdrawn, wrong-subject, wrong-tenant,
  wrong-claim, or wrong-document consent prevents queued/contextual document
  extraction;
- tests proving generic Terms/Privacy acceptance, upload ownership, signed upload
  custody, tenant/session data, and `domain-ai` defaults cannot substitute for
  consent;
- current-authority resolution where `next-slice.mjs .` selects the correct
  next implementation after the prerequisite is promoted or completed.

## Non-Goals

- No implementation in this design-gate PR.
- No runtime source, tests, package metadata, lockfiles, schema, migrations, RLS,
  UI, proxy/routes, auth/session/tenancy, billing, Operational Brain runtime,
  README, or AGENTS changes in this PR.
- No schema/RLS unless the future `T-404a` implementation explicitly gates and
  scopes it with evidence.
- No UI-copy-only fake consent.
- No generic Terms/Privacy substitution for explicit AI document extraction
  consent.
- No proxy, routing, auth, session, tenancy, billing, or domain architecture
  refactor.
- No model/provider call, prompt, outbox AI event, extraction execution,
  autonomous AI decisioning, broad caller codemod, brand minting, `T-403b`,
  `T-405`, or `T-406`.

## Reviewer, Security, And Gate Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Fallback or second-signal reviewer: skipped for Tier 0; no model debate is
required.

Escalation reviewer: skipped for Tier 0; no protected runtime surface is
changed.

Sonar/reviewer comments: pending PR.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

## Exit State

`T-404` is blocked/parked. If this PR's tracker/program updates and
`next-slice.mjs .` resolve `T-404a`, the next active governed implementation
goal is exactly one canonical tracker slice: `T-404a`. If resolver proof does
not support that resolution, the exit state is a no-implementation authority
blocker until the tracker/resolver authority is corrected.

No runtime worker may be created for `T-404` until `T-404a` is implemented,
merged, and current authority explicitly resumes `T-404` with the required
consent evidence.
