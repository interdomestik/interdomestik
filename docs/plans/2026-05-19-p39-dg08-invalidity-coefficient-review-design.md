# P39-DG08 Invalidity Coefficient Review Design Gate

Status: complete
Slice: `P39-DG08`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-19
Authority: repo-canonical closeout and promotion gate. This document closes `P39-ASSIST-07`
after the ASSIST-07 contract landed in main through PR `#821`, and promotes exactly one next
implementation slice:
`P39-ASSIST-08 Invalidity Coefficient Review`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                          |
| -------- | ---------- | ------------------------------------------------------------------------------ |
| `r1`     | 2026-05-19 | Initial approved DG08 promotion record.                                        |
| `r2`     | 2026-05-19 | Design-review clarifications and structural-template alignment with DG06/DG07. |

## Definitions

- Invalidity coefficient: a jurisdiction-specific disability or impairment percentage, rating, or
  coefficient used by qualified reviewers, insurers, experts, or courts. ASSIST-08 may prepare a
  review artifact but must not calculate, assert, or finalize the coefficient.
- Invalidity review: a member-zone, human-review-only assistance artifact that gathers structured
  prerequisite facts and reason codes for qualified review.
- Medical evidence: injury, treatment, prognosis, diagnosis, medical report, therapy, disability,
  or recovery-status facts. It requires explicit medical-document and Article 9 posture.
- Article 9: GDPR special-category data posture for health facts.
- Injury category pre-check: the ASSIST-06 domain contract that supplies non-diagnostic injury
  category and severity-boundary inputs.
- Vehicle damage pre-check: the ASSIST-07 domain contract that supplies vehicle evidence and
  repair/assessment routing context without valuation or liability decisions.
- Compensation valuation: monetary value, settlement amount, payout estimate, or damages
  calculation. It is out of scope.
- Professional Recovery: represented recovery service posture; activation is out of scope.
- RLS: row-level security; no database or RLS changes are authorized by this gate.
- DPIA: data protection impact assessment; a later runtime or AI gate may require one.
- DSR: data subject request; retention and redaction expectations must remain compatible with
  privacy-foundation DSR handling.
- POA: power of attorney; representation or authority documents are out of scope here.
- Outbox: event-emission boundary; ASSIST-08 must not write events or notification payloads.
- AssistanceOutcomeKind: the stable domain outcome taxonomy used by assistance pre-checks.

## Predecessor Dependency

`P39-ASSIST-07 Vehicle Damage Pre-check` is the direct predecessor for this gate.

Predecessor proof:

- `P39-DG07 Vehicle Damage Pre-check Design Gate` is recorded in
  `docs/plans/2026-05-18-p39-dg07-vehicle-damage-precheck-design.md`.
- `P39-DG08 Invalidity Coefficient Review Design Gate` is recorded in
  `docs/plans/2026-05-19-p39-dg08-invalidity-coefficient-review-design.md`.
- `P39-ASSIST-07` landed through PR `#821`, merge commit
  `e7d764f16a2064d099a0a5767c4ba973c69bea65`.
- `P39-ASSIST-07` added pure vehicle damage pre-check contracts, structural privacy alignment,
  bureau-sharing consent separation, health-evidence re-routing, and fail-closed vehicle PII
  boundaries.

`P39-ASSIST-07` was a domain-only contract slice and therefore did not authorize runtime UI, upload
flows, product route changes, database migrations/RLS, CRM/claim/handoff creation,
outbox/event emission, Professional Recovery activation, autonomous AI decisioning,
proxy/canonical route/auth/tenancy/routing changes, Stripe, README, AGENTS, or broad
architecture-doc work.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Privacy gate:
  `docs/plans/2026-05-18-p39-dg05-privacy-consent-sensitive-document-governance.md`.
- Injury gate:
  `docs/plans/2026-05-18-p39-dg06-injury-category-precheck-design.md`.
- Vehicle damage gate:
  `docs/plans/2026-05-18-p39-dg07-vehicle-damage-precheck-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Assistance package contracts: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/outcomes.ts`,
  `packages/domain-assistance/src/rules/disclaimers.ts`,
  `packages/domain-assistance/src/rules/country-rules.ts`,
  `packages/domain-assistance/src/rules/constants.ts`,
  `packages/domain-assistance/src/rules/human-review.ts`,
  `packages/domain-assistance/src/rules/inputs.ts`,
  `packages/domain-assistance/src/rules/injury-category.ts`, and
  `packages/domain-assistance/src/rules/vehicle-damage.ts`.
- Assistance package test patterns:
  `packages/domain-assistance/src/rules/green-card.test.ts`,
  `packages/domain-assistance/src/rules/injury-category.test.ts`,
  `packages/domain-assistance/src/rules/legal-basis.test.ts`,
  `packages/domain-assistance/src/rules/vehicle-damage.test.ts`, and
  `packages/domain-assistance/src/rules.test.ts`.
- Privacy package contracts: `packages/domain-privacy/src/types.ts`,
  `packages/domain-privacy/src/consent.ts`, `packages/domain-privacy/src/documents.ts`,
  `packages/domain-privacy/src/access.ts`, and `packages/domain-privacy/src/ai.ts`.

## Decision

Promote exactly one implementation slice:

`P39-ASSIST-08 Invalidity Coefficient Review`

The promoted slice must implement a bounded member-zone, rules-first invalidity review contract in
`packages/domain-assistance`. It may define review reason codes, prerequisite evidence references,
jurisdiction metadata, consent alignment metadata, readiness outputs, input flags, and
`InvalidityReviewPack` creation helpers. It must remain human-review-only and must not calculate,
score, assert, store, or finalize an invalidity coefficient.

ASSIST-08 must consume the ASSIST-06 injury boundary and ASSIST-07 vehicle boundary through a
deterministic prerequisite matrix, not caller preference. Every successful invalidity review pack
must carry at least one ASSIST-06 injury category reference. ASSIST-07 vehicle damage references are
required whenever the scenario is vehicle or Green Card related, or when the input includes vehicle
damage, vehicle registration, plate/VIN-derived evidence, insurer vehicle correspondence, repair,
towing, bureau, or traffic-incident evidence. If the caller omits the scenario or evidence metadata
needed to evaluate that matrix, ASSIST-08 must fail closed with a structured prerequisite-matrix
reason. It must not re-diagnose injuries, estimate treatment prognosis, value compensation, decide
insurer liability, decide coverage, recommend settlement strategy, or activate Professional
Recovery.

Required prerequisite matrix:

- Every successful pack must carry at least one ASSIST-06 injury category reference.
- Vehicle-context packs must carry at least one ASSIST-07 vehicle damage reference when the
  scenario is vehicle or Green Card related, or when evidence involves vehicle damage, registration,
  plate/VIN-derived facts, insurer vehicle correspondence, repair, towing, bureau, or
  traffic-incident materials.
- Missing scenario or evidence metadata needed to evaluate the matrix must fail closed with
  structured reason `prerequisite_matrix_incomplete`.

ASSIST-08 must consume the `P39-PRIV01` foundation as a contract boundary. Invalidity review inputs
that involve health facts, medical documents, vehicle evidence, insurer correspondence, expert
reports, or legal/professional materials must carry explicit purpose, sensitivity class,
medical-document consent when health facts are involved, Article 9 posture, AI non-finality,
retention, redaction, and human-review expectations. Structural alignment should use exact
`domain-privacy` keys by namespace:

- ProcessingPurpose: `invalidity_review`, `ai_document_extraction`.
- ConsentType: `medical_document_processing`, `ai_document_extraction`.
- DocumentSensitivityClass: `sensitive_health`, `personal`,
  `legal_professional_recovery`.

Focused tests or contract snapshots should fail if those keys drift.

## Candidate Ranking

| Rank | Candidate                                            | Decision | Rationale                                                                                                                              |
| ---- | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P39-ASSIST-08 Invalidity Coefficient Review`        | Promote  | Injury, vehicle, and privacy boundaries are now stable enough to define the member-only, human-review-only invalidity review artifact. |
| 2    | `P39-ASSIST-09` assistance session workflow wiring   | Defer    | Workflow side effects require stable invalidity-review contracts before sessions, claims, CRM, or handoff integration are promoted.    |
| 3    | Runtime member invalidity or incident-guide UI       | Reject   | UI would collect and display sensitive review data before the pure invalidity contract and privacy/review boundary are proven.         |
| 4    | Invalidity coefficient automation or AI calculation  | Reject   | Coefficient calculation is high-stakes medical/legal/financial work and must stay human-review-only.                                   |
| 5    | Professional Recovery activation or finance workflow | Reject   | Recovery requires authorization, service agreement, sharing consent, professional review, licensing posture, and finance/audit trail.  |

## Promoted Slice Scope

Authorized implementation scope:

- Add pure `domain-assistance` invalidity review types, constants, helpers, and tests.
- Reuse existing `AssistanceOutcome`, `InvalidityReviewPack`, PII classification, document
  sensitivity class, country-rule metadata, provenance, and fail-closed conventions where possible.
- Reuse existing `createInvalidityReviewBoundaryOutcome` and
  `CreateInvalidityReviewBoundaryOutcomeInput`; do not fork a parallel boundary helper unless the
  implementation PR explicitly justifies the contract change.
- Preserve `invalidity_review` as member-zone only and human-review-only.
- Represent evidence as structured references, prerequisite codes, review reason codes, and
  summaries, not raw medical narratives, diagnosis text, prognosis text, vehicle photos, plate
  numbers, VINs, insurer correspondence, expert reports, legal strategy, or production-like
  incident narratives.
- Add focused tests for supported member-zone review packs; free-zone and
  Professional-Recovery-like inputs; missing mandatory injury references for every successful pack;
  missing vehicle prerequisite references for vehicle, Green Card, insurer-vehicle, repair, towing,
  bureau, or traffic-incident inputs; incomplete prerequisite-matrix metadata; missing, stale,
  conflicting, incomplete, unsupported, or
  low-confidence country rules; unsupported country, scenario, role, rule family, prerequisite
  code, evidence type, or review reason; attempts to calculate or lower the human-review boundary;
  missing medical-document consent, Article 9 posture, or AI-extraction consent; out-of-scope
  diagnosis, prognosis, treatment, coefficient calculation, compensation valuation, insurer
  liability, coverage, fraud, settlement, or legal-advice requests; synthetic non-identifiable
  evidence references; and AI-assisted provenance forcing pack-level human review.
- Use synthetic, non-identifiable test fixtures only. Tests must not copy real medical records,
  treatment notes, disability reports, registration details, plate numbers, VINs, insurer letters,
  expert reports, legal correspondence, or production-like incident narratives.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.
- Update repo-canonical program/tracker proof for the implementation closeout.
- Reuse the existing exported `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80` constant from
  `domain-assistance`; do not redefine a duplicate floor in ASSIST-08.

The implementation should remain pure domain code. If a direct `@interdomestik/domain-privacy`
import is proposed, the PR must justify why structural alignment is insufficient and prove that the
package boundary stays acyclic, SQL-free, route-free, and side-effect-free.

The expected implementation delta should stay below roughly 80 KB of source/test text unless the
PR body explains why the invalidity review contract needs more room.

## Invalidity Review Contract

`P39-ASSIST-08` must treat invalidity review as a member-zone preparation artifact for human review,
not as a final coefficient, medical diagnosis, disability determination, compensation valuation,
insurer assessment, legal advice, or Professional Recovery activation.

The contract must be able to represent at least:

- applicable jurisdiction country as the primary rule-selection key;
- incident country, member residence, treatment country, vehicle registration country, and insurer
  country as metadata when supplied;
- deterministic tie-breaker reason when applicable jurisdiction diverges from incident, treatment,
  residence, registration, or insurer-country dimensions;
- invalidity review scenario and participant role;
- requested invalidity review rule family;
- prerequisite injury category references and vehicle damage references, where relevant;
- review reason codes and prerequisite status codes;
- structured evidence references with sensitivity and purpose metadata;
- country-rule metadata, confidence, staleness, source, and version;
- required disclaimers as stable code identifiers, not localized strings;
- explicit `requiredHumanReview: true` for every successful member-zone pack;
- privacy alignment keys, document sensitivity class, consent expectations, retention key, and
  redaction posture;
- AI provenance only as advisory extraction/classification metadata, never as final review output.

Outputs must include at least:

- `AssistanceOutcomeKind` from the existing outcome taxonomy;
- invalidity review reason and prerequisite status codes;
- country-rule metadata, rule-readiness state, confidence, staleness, source, and version;
- required disclaimers as stable domain identifiers;
- PII classification and document sensitivity class;
- privacy alignment metadata for purpose, consent, retention, and redaction posture;
- AI provenance when present, marked non-final and advisory only;
- `requiredHumanReview: true` on every successful member-zone pack.

ASSIST-08 should reuse these existing `AssistanceOutcomeKind` values:
`manual_review_required`, `uncertain`, `unsupported_country`, `out_of_scope`,
`requires_member_zone`, and `requires_professional_recovery`. Any new outcome kind is a separate
contract change and must be explicitly justified in the implementation PR.

Required disclaimer identifiers should reuse existing codes: `not_medical_advice`,
`not_legal_advice`, `not_insurer_assessment`, `not_professional_opinion`, and
`professional_review_required`. Any new invalidity or disability disclaimer code, such as
`not_invalidity_assessment` or `not_disability_determination`, must be explicitly added and tested
by ASSIST-08 or deferred to a later contract change.

Initial internal review reason codes may be defined by ASSIST-08. External medical, court, insurer,
or disability-rating scheme mappings are deferred to a later professionally reviewed gate.

## Fail-Closed Rules

Invalidity review must fail closed when:

- request zone is free or Professional Recovery;
- country, scenario, role, rule family, evidence type, prerequisite code, or review reason is
  unsupported;
- applicable jurisdiction is missing;
- incident/treatment/residence/registration/insurer jurisdiction dimensions conflict without a
  deterministic tie-breaker reason;
- country-rule metadata is missing, incomplete, stale, conflicting, unsupported, or below the
  `MINIMUM_COUNTRY_RULE_CONFIDENCE` floor;
- the caller attempts to lower the confidence floor;
- required injury or vehicle prerequisite references are missing or unsupported, including any
  successful pack missing an ASSIST-06 injury category reference;
- vehicle, Green Card, insurer-vehicle, repair, towing, bureau, or traffic-incident inputs are
  missing required ASSIST-07 vehicle damage references;
- scenario or evidence metadata is too incomplete to evaluate the prerequisite matrix;
- required medical-document consent, Article 9 posture, document-processing consent, or
  AI-extraction consent is missing for the requested evidence;
- the request asks for medical diagnosis, prognosis, treatment advice, coefficient calculation,
  compensation valuation, insurer liability, coverage decision, fraud determination, settlement
  strategy, legal advice, or Professional Recovery activation;
- AI provenance is present without no-training, zero-retention, non-final, and human-review
  posture.

Fail-closed outputs must resolve only to one of the permitted non-final outcome kinds:
`manual_review_required`, `uncertain`, `unsupported_country`, `out_of_scope`,
`requires_member_zone`, or `requires_professional_recovery`. They must never resolve to final
medical diagnosis, disability determination, coefficient calculation, compensation valuation,
insurer coverage/liability/fraud decision, settlement strategy, legal advice, or recovery
activation.

## Privacy And AI Boundary

- Invalidity review is member-zone only and human-review-only.
- Health facts are sensitive health data and require explicit medical-document consent or another
  documented Article 9 posture before processing.
- Medical, expert, insurer, legal, and vehicle evidence must be represented as structured
  references or redacted summaries only.
- Raw medical narratives, diagnosis text, prognosis text, expert reports, legal strategy, plate
  numbers, VINs, and insurer correspondence must not appear in logs, metrics, outbox payloads, or
  test fixtures.
- AI may assist extraction or classification only as non-final, no-training, zero-retention,
  human-review-gated input with provenance. AI must not calculate or recommend an invalidity
  coefficient.
- Disclaimer codes must remain domain-boundary identifiers. UI localization is a later layer.
- Agent/promoter access to sensitive medical, case, or legal/professional documents remains denied
  by design.

This gate does not authorize new AI behavior. ASSIST-08 must not introduce model calls, prompt
changes, embeddings, retrieval, model routing, or AI runtime workflows; any later AI workflow must
come through a separate gate and remain non-final, no-training, zero-retention, and
human-review-gated.

## Non-Goals

- Runtime UI or `/member/incident-guide` redesign.
- Upload flow or document storage behavior.
- Database migrations, RLS changes, or consent/document persistence.
- CRM, claim, support-handoff, activity, outbox, notification, billing, or finance side effects.
- Direct `domain-crm` imports from `domain-assistance`.
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, POA, or
  agreement flow.
- Automated invalidity coefficient calculation or AI final decisioning.
- Medical diagnosis, prognosis, treatment advice, compensation valuation, insurer liability,
  coverage decision, fraud determination, settlement strategy, or final legal advice.
- Proxy, canonical `/member`, `/agent`, `/staff`, `/admin` route, auth, tenancy, routing, Stripe,
  README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- Invalidity review contracts are public, typed, and covered by focused unit tests.
- Every successful invalidity review pack is member-zone only and has `requiredHumanReview: true`.
- The implementation fails closed for unsupported inputs, missing consent, missing jurisdiction,
  stale or low-confidence rules, and any request for coefficient calculation or final advice.
- The implementation preserves the ASSIST-06 injury boundary and ASSIST-07 vehicle boundary as
  structured references rather than reprocessing raw medical or vehicle evidence, with a
  deterministic prerequisite matrix proving that every successful pack has injury-category proof
  and vehicle-context packs have vehicle-damage proof.
- Privacy alignment includes purpose, sensitivity class, medical-document consent, Article 9
  posture, AI non-finality, retention, redaction, and human-review state.
- AI is not introduced and cannot be a final decision-maker.
- No runtime UI, upload flow, persistence, CRM/claim/handoff side effect, outbox/event emission,
  Professional Recovery activation, proxy/canonical route/auth/tenancy/routing change, Stripe,
  README, AGENTS, or broad architecture-doc change is included.
- Tests use synthetic, non-identifiable fixtures only.
- An independent implementation review verifies security/privacy, product/legal boundary,
  platform/domain purity, QA/fail-closed coverage, and disclaimer/outcome taxonomy changes.

## Implementation Review Plan

Because this is an implementation slice with health, disability, vehicle, insurer, privacy, PII,
and human-review boundaries, the ASSIST-08 PR must include independent review evidence before
merge. Reviewer areas:

- Security/privacy: medical consent, Article 9 posture, sensitivity class, logging redaction, AI
  non-finality, and no raw sensitive fixture use.
- Product/legal boundary: no coefficient calculation, valuation, insurer liability, settlement
  strategy, legal advice, or recovery activation.
- Platform/domain purity: package remains pure, SQL-free, route-free, side-effect-free, and
  acyclic.
- QA/gates: fail-closed tests cover unsupported, missing, stale, conflicting, low-confidence,
  missing-consent, and out-of-scope inputs.
- Taxonomy: any new outcome, disclaimer, review reason, or prerequisite code is explicit and
  justified.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: invalidity review can drift into final coefficient calculation or disability determination.
- High: medical, expert, insurer, and legal evidence can leak special-category or professional
  material if represented as raw text.
- High: AI extraction can be mistaken for coefficient recommendation unless the contract is
  hard-fail and human-review-gated.
- Medium: jurisdiction-specific invalidity schemes may require external medical/legal taxonomy
  mappings; those are deferred.
- Medium: injury and vehicle prerequisite references may be incomplete until later runtime
  assistance-session work exists.
- Medium: Professional Recovery eligibility may be tempting to infer from invalidity review; this
  gate blocks activation and recovery decisions.

Rollback path: because ASSIST-08 is pure domain code, rollback is a normal revert PR before any
runtime caller depends on it. New public code identifiers added by ASSIST-08 must be deprecated
rather than removed if later rendered by UI.

## Approval Bar

Approve DG08 only if:

- ASSIST-07 predecessor proof is satisfied.
- Only `P39-ASSIST-08 Invalidity Coefficient Review` is promoted.
- Scope is pure `domain-assistance`, member-zone only, and human-review-only.
- Privacy/consent, Article 9, AI non-finality, redaction, retention, disclaimer, and fail-closed
  boundaries are explicit.
- Runtime UI, upload flows, persistence, CRM/claim/handoff side effects, Professional Recovery
  activation, proxy/canonical route/auth/tenancy/routing changes, Stripe, README, AGENTS, and broad
  architecture-doc changes remain blocked.

## Verification

Design-gate PR verification must include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs/budget-only delta

Implementation tests run in the promoted ASSIST-08 PR, not in this design gate. This design-gate PR
should remain a docs/budget-only delta.

## Completion State

| Item                                                 | Status    | Decision                                                            |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `P39-ASSIST-07 Vehicle Damage Pre-check`             | completed | Predecessor implementation completed through PR `#821`.             |
| `P39-DG08 Invalidity Coefficient Review Design Gate` | completed | This gate closes ASSIST-07 and promotes ASSIST-08.                  |
| `P39-ASSIST-08 Invalidity Coefficient Review`        | promoted  | Only pure member-zone, human-review-only domain work is authorized. |
| `P39-ASSIST-09` through recovery runtime work        | reserved  | No implementation authority from this gate.                         |
