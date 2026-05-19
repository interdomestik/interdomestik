# P39-DG09 Assistance Session Workflow Wiring Design Gate

Status: complete
Slice: `P39-DG09`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-19
Authority: repo-canonical closeout and promotion gate after `P39-ASSIST-08`. This document
promotes exactly one next implementation slice: `P39-ASSIST-09 Assistance Session Workflow Wiring
Contract`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-19 | Initial DG09 review draft after ASSIST-08 PR green checks.                                                           |
| `r2`     | 2026-05-19 | Design-review clarifications for intent shape, taxonomy reuse, fail-closed output semantics, and privacy boundaries. |
| `r3`     | 2026-05-19 | Promote DG09 after ASSIST-08 merge proof on main.                                                                    |

## Definitions

- Assistance session digest: the `AssistanceSessionDigest` contract emitted by
  `domain-assistance`, containing pack summaries, outcomes, consent state, disclaimers, country
  metadata, AI provenance, and PII classification.
- Workflow wiring contract: a pure, deterministic mapping from an assistance session digest to
  non-executing workflow intents. It may describe what a later caller should do, but it must not
  create, update, or link records.
- Workflow intent: a typed instruction such as `support_handoff_needed`,
  `claim_context_needed`, `crm_follow_up_needed`, `member_zone_required`, or
  `professional_recovery_review_required`. An intent is not an action.
- Execution adapter: a later runtime/application layer that may execute approved intents through
  existing claim, CRM, support-handoff, consent, or Professional Recovery boundaries. Execution is
  out of scope for ASSIST-09.
- Outbox: event-emission boundary; ASSIST-09 must not write events or notification payloads.
- Professional Recovery: represented recovery service posture; activation is out of scope.
- POA: power of attorney; representation authority documents are out of scope here.
- RLS: row-level security; no database or RLS changes are authorized by this gate.
- DSR: data subject request; digest and intent retention expectations must remain compatible with
  privacy-foundation DSR handling.
- AssistanceOutcomeKind: the stable domain outcome taxonomy used by assistance pre-checks.
- EscalationRecommendation: the existing assistance digest signal `none`, `member_zone`,
  `staff_handoff`, `professional_recovery`, or `emergency_services`; ASSIST-09 may consume this as
  an input signal, but workflow intent kinds remain a separate ASSIST-09-owned taxonomy.
- Article 9: GDPR special-category personal data rule; health facts in assistance outputs keep the
  higher consent and human-review floor established by DG06 and DG08.
- DPIA: data protection impact assessment; ASSIST-09 must stay compatible with privacy-foundation
  review even though it adds no runtime processing flow.

## Predecessor Dependency

`P39-ASSIST-08 Invalidity Coefficient Review` is the direct predecessor for this gate.

Predecessor proof required before approval:

- `P39-DG08 Invalidity Coefficient Review Design Gate` is recorded in
  `docs/plans/2026-05-19-p39-dg08-invalidity-coefficient-review-design.md`.
- `P39-ASSIST-08` PR `#823` merged to `main` on 2026-05-19 with merge commit
  `95805bcd3fb8fcc7a93611eb8fd12137b69142b9`.
- PR `#823` head `20162ff67fe74449278855f517438a1db4f01c30` passed CI unit/static,
  `e2e`, `e2e-gate`, `pilot-gate`, `pr-finalizer`, gitleaks, pnpm audit, SonarCloud, Vercel,
  and validation-surface checks before merge.
- `P39-ASSIST-08` adds pure invalidity review contracts, prerequisite injury and vehicle
  references, sensitive-health and legal/professional sensitivity handling, Article 9 posture, AI
  non-finality, and human-review-only invalidity review boundaries.

`P39-ASSIST-08` is a domain-only contract slice and does not authorize runtime UI, upload flows,
product route changes, database migrations/RLS, CRM/claim/handoff creation, outbox/event emission,
Professional Recovery activation, autonomous AI decisioning, proxy/canonical
route/auth/tenancy/routing changes, Stripe, README, AGENTS, or broad architecture-doc work.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Privacy gate:
  `docs/plans/2026-05-18-p39-dg05-privacy-consent-sensitive-document-governance.md`.
- Injury gate:
  `docs/plans/2026-05-18-p39-dg06-injury-category-precheck-design.md`.
- Vehicle damage gate:
  `docs/plans/2026-05-18-p39-dg07-vehicle-damage-precheck-design.md`.
- Invalidity review gate:
  `docs/plans/2026-05-19-p39-dg08-invalidity-coefficient-review-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Assistance package contracts: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/session-digest.ts`,
  `packages/domain-assistance/src/rules/help-now.ts`,
  `packages/domain-assistance/src/rules/outcomes.ts`,
  `packages/domain-assistance/src/rules/disclaimers.ts`,
  `packages/domain-assistance/src/rules/country-rules.ts`,
  `packages/domain-assistance/src/rules/constants.ts`,
  `packages/domain-assistance/src/rules/human-review.ts`,
  `packages/domain-assistance/src/rules/inputs.ts`,
  `packages/domain-assistance/src/rules/rule-utils.ts`,
  `packages/domain-assistance/src/rules/injury-category.ts`,
  `packages/domain-assistance/src/rules/vehicle-damage.ts`, and
  `packages/domain-assistance/src/rules/invalidity-review.ts`.
- Assistance package test patterns: `packages/domain-assistance/src/rules.test.ts`,
  `packages/domain-assistance/src/rules/green-card.test.ts`,
  `packages/domain-assistance/src/rules/legal-basis.test.ts`,
  `packages/domain-assistance/src/rules/procedure-guide.test.ts`,
  `packages/domain-assistance/src/rules/injury-category.test.ts`,
  `packages/domain-assistance/src/rules/vehicle-damage.test.ts`, and
  `packages/domain-assistance/src/rules/invalidity-review.test.ts`.
- Privacy package contracts: `packages/domain-privacy/src/types.ts`,
  `packages/domain-privacy/src/consent.ts`, `packages/domain-privacy/src/documents.ts`,
  `packages/domain-privacy/src/access.ts`, and `packages/domain-privacy/src/ai.ts`.
- CRM support-handoff contracts for structural alignment only:
  `packages/domain-crm/src/support-handoffs` and `packages/domain-crm/src/timeline`.

## Decision

Promote exactly one implementation slice:

`P39-ASSIST-09 Assistance Session Workflow Wiring Contract`

The promoted slice must add a pure workflow-intent composer for `AssistanceSessionDigest` outputs.
It may define intent types, routing reasons, consent prerequisites, execution blockers, and
idempotency/reference keys needed by a later runtime caller. It must not create, update, link, or
persist CRM leads, claims, support handoffs, consent records, agreement records, billing records,
finance records, outbox events, notifications, uploads, or Professional Recovery state.

ASSIST-09 must consume the completed assistance packs only through typed summaries and outcomes:
incident scene, legal basis, procedure guide, injury category, vehicle damage, invalidity review,
and recovery eligibility placeholders. It must not re-run or reinterpret medical, vehicle, legal,
insurer, or invalidity evidence.

ASSIST-09 must reuse the existing `createAssistanceSessionDigest` output and must not fork or
re-derive the digest contract. It should reuse the current `AssistanceOutcomeKind`,
`AssistanceDisclaimerCode`, `PiiClassification`, `AssistanceConsentState`,
`EscalationRecommendation`, `AssistancePackType`, and `AssistancePackSummary` contracts from
`packages/domain-assistance/src/types.ts`.

The composer must fail closed to a non-executing blocked intent when required session identity,
member attachment, consent state, disclaimers, human-review state, sensitivity metadata, or
country-rule metadata is incomplete. It must not infer consent, professional authority, POA,
recovery authorization, insurer-sharing permission, or claim ownership from the digest alone.

## Candidate Ranking

| Rank | Candidate                                                   | Decision | Rationale                                                                                                                |
| ---- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P39-ASSIST-09 Assistance Session Workflow Wiring Contract` | Promote  | The pack contracts are now stable enough to define a no-side-effect intent boundary before runtime execution is allowed. |
| 2    | Runtime claim/support-handoff/CRM creation from assistance  | Defer    | Record creation needs explicit adapters, authorization, idempotency, RLS, audit, and consent persistence proof.          |
| 3    | `/member/incident-guide` or Help Now UI integration         | Defer    | UI collection/display of sensitive assistance data needs the intent contract and execution adapter boundary first.       |
| 4    | Professional Recovery activation                            | Reject   | Activation requires authorization, agreement, consent, professional review, licensing, finance, and audit custody.       |
| 5    | AI assistance session orchestration or agentic workflow     | Reject   | AI runtime behavior needs a separate AI production gate, evals, traces, prompt-injection review, and rollback posture.   |

## Promoted Slice Scope

Authorized implementation scope:

- Add pure `domain-assistance` workflow-intent types, constants, helpers, and tests.
- Define a deterministic `createAssistanceWorkflowIntents`-style helper that consumes
  `AssistanceSessionDigest` and returns typed intents plus blocked reasons.
- Keep intents as strings and structured references. Do not import `domain-crm`, `domain-claims`,
  database packages, app routes, server actions, or upload/storage modules from `domain-assistance`.
- Represent target surfaces as structural identifiers such as `claim_context`, `support_handoff`,
  `crm_follow_up`, `member_zone`, and `professional_recovery_review`, not as direct repository
  calls or app route calls.
- Preserve digest `externalRecordIds?: never` and `createdRecordIds?: never`; ASSIST-09 must not
  add created-record IDs to the digest.
- Add focused tests for member-zone explicit-consent sessions, anonymous/free-zone sessions,
  support-handoff-needed recommendations, claim-context-needed recommendations,
  professional-recovery-review blockers, human-review-required packs, missing member identity,
  missing explicit consent, missing disclaimers, missing country metadata, unsupported or final
  outcomes, sensitive-health or legal/professional sessions, AI-assisted non-final provenance, and
  no created-record IDs.
- Add focused workflow-wiring tests for deterministic output ordering across equivalent inputs,
  idempotency/reference key stability under stable input and drift under meaningful input changes,
  and no raw narrative, plate, VIN, medical text, insurer correspondence, or expert-report leakage
  into intent reason codes or reference keys.
- Use synthetic, non-identifiable test fixtures only. Tests must not copy real medical records,
  vehicle identifiers, insurer letters, legal correspondence, support-handoff messages, claim
  narratives, CRM leads, or production-like incident details.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.
- Update repo-canonical program/tracker proof only in the implementation closeout PR.

The expected implementation delta should stay below roughly 60 KB of source/test text unless the
PR body explains why the intent contract needs more room. This is lower than the pack-contract
budget because ASSIST-09 should add intent envelopes and tests, not new evidence taxonomies.

## Workflow Intent Contract

ASSIST-09 must treat workflow wiring as a non-executing preparation artifact. The contract must be
able to represent at least:

- session id, zone, optional member id, country, and consent state;
- pack summaries and outcome kinds from the digest;
- required human review and pack-level human-review reasons;
- highest PII classification and sensitivity posture;
- disclaimer codes shown at the assistance boundary;
- country-rule metadata references;
- AI provenance only as advisory non-final metadata;
- intended target surface as a stable code identifier;
- blocker reasons when execution is unsafe or incomplete;
- idempotency/reference key material for later adapters without creating records.

The helper should return a deterministic, deduplicated, stably ordered readonly list of intent
envelopes. A successful no-op may return an empty list only when no target surface is implied and
all prerequisites are complete; unsafe or incomplete inputs must return at least one blocked,
non-executing intent.

Intent envelopes must include at least:

- a deterministic intent kind from an ASSIST-09-owned allowlist;
- `executionAllowed: false` as a literal field for every output in ASSIST-09;
- target surface code or blocked target code;
- reasons and evidence references suitable for human review;
- required consent/disclaimer/human-review flags;
- PII classification and retention/redaction posture derived from the digest;
- no created CRM, claim, handoff, outbox, upload, billing, agreement, consent, finance, or
  Professional Recovery record identifiers.

The implementation may use a shape equivalent to:

```ts
interface AssistanceWorkflowIntent {
  intentKind: AssistanceWorkflowIntentKind;
  targetSurface: AssistanceWorkflowTargetSurface;
  executionAllowed: false;
  blocked: boolean;
  outcomeKind?: AssistanceOutcomeKind;
  reasons: readonly AssistanceReason[];
  evidence: readonly AssistanceEvidenceReference[];
  referenceKey: string;
}
```

`intentKind` describes the workflow preparation result. `outcomeKind`, when present, is only a
source outcome copied from the digest and must not be used to invent a new outcome taxonomy.
`EscalationRecommendation` is an input signal for selecting or blocking intents; it is not itself
the intent taxonomy.

Pack-summary and outcome reconciliation must not add `packId` to `AssistanceOutcome` in ASSIST-09.
The composer must treat `packSummaries` and `outcomes` as the ordered digest pair emitted by
`createAssistanceSessionDigest`; it must fail closed when counts differ or when any paired summary
and outcome disagree on `zone`, `outcomeKind`, human-review posture, disclaimers, or
country-rule metadata.

ASSIST-09 should reuse existing `AssistanceOutcomeKind` values and must not add final outcome
kinds. Any new outcome kind is a separate contract change and must be explicitly justified in the
implementation PR.

Required disclaimer identifiers must be passed through from the digest and stay within the existing
`AssistanceDisclaimerCode` union: `not_legal_advice`, `not_medical_advice`,
`not_insurer_assessment`, `not_professional_opinion`, `not_repair_estimate`,
`not_diminished_value_valuation`, `not_liability_assessment`,
`not_insurer_coverage_decision`, `not_fraud_determination`, `educational_only`, and
`professional_review_required`. ASSIST-09 must not add disclaimer codes; any addition is a
separate contract change. The implementation must not convert disclaimer codes to localized
strings.

ASSIST-09 inherits `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80` through digest country-rule metadata
and must not redefine or lower the floor.

Idempotency and reference key material must be deterministic and hash-safe. Keys must not embed raw
user narratives, plate numbers, VINs, medical text, insurer correspondence, expert reports, or
other sensitive evidence text.

## Fail-Closed Rules

Workflow intent composition must fail closed to a blocked, non-executing intent when:

- the digest is anonymous but an intent would require member attachment;
- consent state is not `explicit_consent_recorded` for member-zone or sensitive workflow intents;
- required disclaimers are missing or incomplete;
- country-rule metadata is absent for country-dependent packs;
- pack summaries and ordered outcomes disagree on zone, outcome kind, disclaimers, country-rule
  metadata, or human-review posture;
- digest PII classification is `medical_sensitive`, `legal_financial_sensitive`, or
  `professional_secret` without human-review posture;
- AI provenance is present without non-final, advisory-only handling;
- any outcome asks for final medical, invalidity, vehicle, insurer, legal, compensation,
  settlement, or recovery execution;
- the digest carries or requests created/external record IDs;
- Professional Recovery activation, POA, agreement execution, billing, finance, or outbox behavior
  is requested.

Fail-closed outputs must never create or imply created records. They may only return blocked
intents and structured reason codes for a later human or implementation gate.

Allowed fail-closed source outcome kinds remain the existing assistance taxonomy values
`manual_review_required`, `uncertain`, `unsupported_country`, `out_of_scope`,
`requires_member_zone`, and `requires_professional_recovery`. ASSIST-09 may attach one of those
values to an intent as copied context, but blocked workflow intents must be represented by
ASSIST-09-owned intent or blocker codes, not by new `AssistanceOutcomeKind` values.

## Privacy And AI Boundary

- ASSIST-09 is no-side-effect domain contract work only.
- Sensitive medical, vehicle, legal, insurer, and professional facts must remain structured
  references or digest summaries. Raw narratives must not appear in logs, metrics, tests, outbox
  payloads, or intent IDs.
- Consent must not be inferred from member identity, claim existence, handoff existence, or CRM
  presence.
- AI provenance may influence human-review flags only. It must not authorize workflow execution,
  record creation, escalation, recovery activation, or final advice.
- Disclaimer codes must remain domain-boundary identifiers. UI localization is a later layer.
- Agent/promoter access to sensitive medical, case, or legal/professional material remains denied
  by design.
- Reference key material may align structurally with `PrivacyScope.assistanceSessionId` for later
  DSR and audit correlation, but ASSIST-09 must not import or execute domain-privacy runtime
  behavior.

This gate does not authorize new AI behavior. ASSIST-09 must not introduce model calls, prompt
changes, embeddings, retrieval, model routing, AI tools, AI queues, or AI runtime workflows.

## Non-Goals

- Runtime UI, Help Now UI, or `/member/incident-guide` redesign.
- Upload flow, document storage behavior, or document parsing.
- Database migrations, RLS changes, or consent/document persistence.
- CRM lead, claim, support-handoff, activity, outbox, notification, billing, agreement, or finance
  record creation.
- Reading from CRM or claims, event emission, idempotency persistence, analytics events,
  localization, log lines, time/IO side effects, or runtime adapters.
- Direct `domain-crm`, `domain-claims`, app route, server-action, database, or upload imports from
  `domain-assistance`.
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, POA, or
  agreement flow.
- Automated invalidity coefficient calculation, compensation valuation, insurer liability,
  coverage decision, fraud determination, settlement strategy, medical diagnosis, treatment advice,
  or final legal advice.
- Proxy, canonical `/member`, `/agent`, `/staff`, `/admin` route, auth, tenancy, routing, Stripe,
  README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- Workflow intent contracts are public, typed, deterministic, and covered by focused unit tests.
- Every ASSIST-09 output is non-executing and has literal `executionAllowed: false`.
- Intent output ordering and idempotency/reference keys are deterministic and do not leak raw
  sensitive evidence.
- The implementation fails closed for missing identity, missing explicit consent, missing
  disclaimers, missing country metadata, sensitivity/human-review mismatches, AI provenance, and
  any request for runtime record creation.
- Fail-closed outputs reuse existing `AssistanceOutcomeKind` context only and introduce no new
  outcome or disclaimer codes.
- The implementation consumes `AssistanceSessionDigest` only; it does not reprocess raw pack
  evidence or import runtime packages.
- Privacy alignment preserves PII classification, consent state, disclaimer codes, redaction
  posture, and human-review state.
- AI is not introduced and cannot authorize execution.
- No runtime UI, upload flow, persistence, CRM/claim/handoff side effect, outbox/event emission,
  Professional Recovery activation, proxy/canonical route/auth/tenancy/routing change, Stripe,
  README, AGENTS, or broad architecture-doc change is included.
- Tests use synthetic, non-identifiable fixtures only.
- An independent implementation review verifies security/privacy, product/legal boundary,
  platform/domain purity, QA/fail-closed coverage, and intent taxonomy changes.

## Implementation Review Plan

Because ASSIST-09 bridges assistance outputs toward later runtime workflows, the implementation PR
must include independent review evidence before merge. Reviewer areas:

- Security/privacy: consent inference, sensitive-data redaction, PII class propagation, AI
  non-finality, and no raw sensitive fixture use.
- Product/legal boundary: no final advice, recovery activation, insurer/medical/legal decision, or
  record creation.
- Platform/domain purity: package remains pure, SQL-free, route-free, side-effect-free, and
  acyclic.
- QA/gates: fail-closed tests cover unsupported, incomplete, sensitive, AI-assisted, and
  side-effect-attempt inputs.
- Taxonomy: any new intent, target, blocker, outcome, or disclaimer code is explicit and justified.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: workflow intents can be mistaken for authorization to create CRM, claim, handoff, or
  recovery records.
- High: consent can be incorrectly inferred from member identity or existing records.
- High: sensitive health, legal, vehicle, insurer, or professional facts can leak if intent IDs or
  reason strings embed raw user narratives.
- High: pack-summary and outcome reconciliation can drift if implementation ignores the ordered
  digest pair or tries to add pack IDs to `AssistanceOutcome`.
- Medium: intent-kind taxonomy can collide with existing `EscalationRecommendation` values if the
  implementation treats recommendations as executable intents.
- Medium: later runtime adapters will need idempotency, authorization, RLS, audit, and rollback
  proof before executing any intent.
- Medium: Professional Recovery eligibility may be tempting to infer from digest outcomes; this
  gate allows review intent only and blocks activation.
- Medium: external tracker and Notion closeout for ASSIST-08 must be reconciled after PR `#823`
  merges before DG09 approval.

Rollback path: because ASSIST-09 is pure domain contract code, rollback is a normal revert PR
before any runtime caller depends on it. New public intent identifiers added by ASSIST-09 must be
deprecated rather than removed if later rendered by UI or consumed by adapters.

## Approval Bar

Approve DG09 only if:

- ASSIST-08 predecessor proof is satisfied on `main`.
- Only `P39-ASSIST-09 Assistance Session Workflow Wiring Contract` is promoted.
- Scope is pure `domain-assistance`, no-side-effect, and intent-only.
- Privacy/consent, AI non-finality, redaction, disclaimer, human-review, and fail-closed
  boundaries are explicit.
- Runtime UI, upload flows, persistence, CRM/claim/handoff side effects, outbox/event emission,
  Professional Recovery activation, proxy/canonical route/auth/tenancy/routing changes, Stripe,
  README, AGENTS, and broad architecture-doc changes remain blocked.

## Verification

Design-gate PR verification must include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs/budget-only delta

Implementation tests run in the promoted ASSIST-09 PR, not in this design gate. This design-gate PR
should remain a docs/budget-only delta after predecessor merge proof is updated.

## Completion State

| Item                                                 | Status    | Decision                                                                   |
| ---------------------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `P39-ASSIST-08 Invalidity Coefficient Review`        | completed | PR `#823` merged to `main` at `95805bcd3fb8fcc7a93611eb8fd12137b69142b9`.  |
| `P39-DG09 Assistance Session Workflow Wiring Design` | complete  | Promotes exactly one next implementation slice.                            |
| `P39-ASSIST-09 Assistance Session Workflow Wiring`   | pending   | Promoted intent-only contract slice; implementation must use a new branch. |
| Runtime workflow execution and Professional Recovery | reserved  | No implementation authority from this draft.                               |
