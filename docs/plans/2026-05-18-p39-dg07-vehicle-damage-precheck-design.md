# P39-DG07 Vehicle Damage Pre-check Design Gate

Status: complete
Slice: `P39-DG07`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-18
Authority: repo-canonical closeout and promotion gate. This document closes `P39-ASSIST-06`
after the ASSIST-06 contract landed in main through PR `#817`, and promotes exactly one next
implementation slice:
`P39-ASSIST-07 Vehicle Damage Pre-check`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                      |
| -------- | ---------- | ------------------------------------------ |
| `r1`     | 2026-05-18 | Initial approved DG07 promotion record.    |
| `r2`     | 2026-05-18 | Design-review clarifications before merge. |
| `r3`     | 2026-05-19 | Review hardening for privacy/disclaimers.  |

## Definitions

- Registration country: the country where the damaged vehicle is registered; it is vehicle
  metadata, not the primary rule-selection key unless a vehicle-specific rule requires it.
- Incident country: the country where the accident or damage event occurred.
- Applicable jurisdiction: the primary country key used for ASSIST-07 rule selection.
- Insurer country: the country of the insurer or claims handler; it is sharing and coverage
  metadata, not a final coverage decision input.
- Green card: cross-border motor insurance evidence handled by the DG02 green-card adapter; this
  gate may consume its metadata but does not replace it.
- Diminished value: loss of market value after repair; final valuation is out of scope.
- Total loss / salvage: repairability or write-off posture; final determination is out of scope.
- Third-party liability / comprehensive: insurance coverage categories; final coverage or fault
  decisions are out of scope.
- Fault attribution: assigning responsibility for the incident; out of scope for ASSIST-07.
- Repair appraisal: professional estimate or inspection result; ASSIST-07 may reference it but
  must not produce a final appraisal.
- Bureau reference: insurer, regulatory, or motor-claims bureau evidence reference; it must be a
  structured reference, not raw narrative or unrestricted document contents.
- Article 9: GDPR special-category data posture for health facts; vehicle evidence containing
  health facts must route to injury and sensitive-health contracts.
- RLS: row-level security; no database or RLS changes are authorized by this gate.
- DPIA: data protection impact assessment; a later runtime or AI gate may require one.
- DSR: data subject request; retention and redaction expectations must remain compatible with
  privacy-foundation DSR handling.
- POA: power of attorney; representation or authority documents are out of scope here.
- Outbox: event-emission boundary; ASSIST-07 must not write events or notification payloads.
- Professional Recovery: represented recovery service posture; activation is out of scope.
- AssistanceOutcomeKind: the stable domain outcome taxonomy used by assistance pre-checks.

## Predecessor Dependency

`P39-ASSIST-06 Injury Category Pre-check` is the direct predecessor for this gate.

Predecessor proof:

- `P39-DG06 Injury Category Pre-check Design Gate` is recorded in
  `docs/plans/2026-05-18-p39-dg06-injury-category-precheck-design.md`.
- `P39-DG07 Vehicle Damage Pre-check Design Gate` is recorded in
  `docs/plans/2026-05-18-p39-dg07-vehicle-damage-precheck-design.md`.
- `P39-ASSIST-06` landed through PR `#817`, merge commit
  `594b2441cfea897e638bdc6c8b6db69e236bd6dc`.
- `P39-ASSIST-06` added pure injury category pre-check contracts, synthetic non-identifiable proof,
  structural privacy alignment, and the expected fail-closed health-data boundary.

`P39-ASSIST-06` was a domain-only contract slice and therefore did not authorize runtime UI, upload
flows, product route changes, database migrations/RLS, CRM/claim/handoff creation,
outbox/event emission, Professional Recovery
activation, autonomous AI decisioning, proxy/canonical route/auth/tenancy/routing changes, Stripe,
README, AGENTS, or broad architecture-doc work.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Privacy gate:
  `docs/plans/2026-05-18-p39-dg05-privacy-consent-sensitive-document-governance.md`.
- Injury gate:
  `docs/plans/2026-05-18-p39-dg06-injury-category-precheck-design.md`.
- Green-card country-rule adapter gate:
  `docs/plans/2026-05-18-p39-dg02-green-card-country-rules-adapter-design.md`.
- Legal-basis pre-check gate:
  `docs/plans/2026-05-18-p39-dg03-legal-basis-precheck-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Assistance package contracts: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/outcomes.ts`,
  `packages/domain-assistance/src/rules/disclaimers.ts`,
  `packages/domain-assistance/src/rules/country-rules.ts`,
  `packages/domain-assistance/src/rules/human-review.ts`,
  `packages/domain-assistance/src/rules/constants.ts`, and
  `packages/domain-assistance/src/rules/injury-category.ts`.
- Assistance package test patterns:
  `packages/domain-assistance/src/rules/injury-category.test.ts` and
  `packages/domain-assistance/src/rules/green-card.test.ts`.
- Existing vehicle-adjacent rule adapter:
  `packages/domain-assistance/src/rules/green-card.ts`. No vehicle damage evaluator exists before
  ASSIST-07; `VehicleDamagePack` already exists as a pack shape in
  `packages/domain-assistance/src/types.ts`.
- Privacy package contracts: `packages/domain-privacy/src/types.ts`,
  `packages/domain-privacy/src/consent.ts`, `packages/domain-privacy/src/documents.ts`,
  `packages/domain-privacy/src/access.ts`, and `packages/domain-privacy/src/ai.ts`.

## Decision

Promote exactly one implementation slice:

`P39-ASSIST-07 Vehicle Damage Pre-check`

The promoted slice must implement a bounded member-zone, rules-first vehicle damage pre-check in
`packages/domain-assistance`. It may define vehicle damage rule families, damage category codes,
inspection or repair-readiness markers, vehicle evidence-reference contracts, privacy-purpose
alignment metadata, readiness outputs, input flags, and pack creation helpers. Inspection readiness
markers are structured outputs that indicate whether more human inspection evidence is needed;
repair/assessment routing markers are non-final reason codes that indicate professional review
posture without estimating repair cost or liability.

It must not create product runtime UI, upload flows, persistence, claims, CRM handoffs, outbox
events, Professional Recovery activation, autonomous AI decisions, final repair valuations, insurer
liability findings, fraud determinations, settlement strategy, or legal advice.

`P39-ASSIST-07` must consume the `P39-PRIV01` foundation as a contract boundary. Vehicle outputs
that involve registration documents, vehicle photos, location, insurer documents, police reports,
bureau references, towing, or repair evidence must carry explicit purpose, document-processing
consent, insurer-sharing consent when sharing is requested, retention, redaction, AI non-finality,
and human-review expectations. Vehicle damage data is not GDPR special-category data by default,
but registration-country and applicable-jurisdiction divergence still triggers cross-border
processing discipline under DG02 and DG05. Structural alignment should use exact `domain-privacy`
keys:
`vehicle_damage_precheck`, `document_upload_processing`, `ai_document_extraction`, and
`share_with_insurer`; focused tests or contract snapshots should fail if those keys drift.
`document_upload_processing` is the umbrella processing consent for vehicle photos, police reports,
towing records, bureau references, repair invoices, and insurer correspondence unless a later
privacy-foundation amendment adds a narrower key. This gate does not broaden DG05; if ASSIST-07
needs narrower processing semantics, it must route them through a privacy-foundation amendment.
Document-processing consent is required for the pre-check itself. Insurer-sharing consent is
separate, independently required when sharing is requested, and is never implied by
document-processing consent. Bureau sharing is also separate: if outbound bureau sharing is
introduced, ASSIST-07 must align with the existing `share_with_bureau` consent key and must not
infer bureau-sharing consent from document-processing or insurer-sharing consent.

Health facts found inside vehicle evidence must defer to the injury and sensitive-health contracts
instead of being processed as ordinary vehicle damage. ASSIST-07 must fail closed with
`manual_review_required` and the structured reason `health_evidence_requires_injury_review`; it
must not return a split vehicle-plus-injury pack from the vehicle damage evaluator.

ASSIST-07 may run alongside DG02 green-card rule metadata for cross-border insurance posture, but
green-card eligibility and coverage remain owned by the green-card adapter. ASSIST-07 may reuse
`GREEN_CARD_JURISDICTION_ROLES` constants where structurally appropriate, but must not collapse
vehicle damage, legal-basis, green-card, and insurer-coverage decisions into one rule.

## Candidate Ranking

| Rank | Candidate                                            | Decision | Rationale                                                                                                                                 |
| ---- | ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P39-ASSIST-07 Vehicle Damage Pre-check`             | Promote  | Injury and privacy foundations are now in place; vehicle damage is the next member-zone pack before invalidity or recovery eligibility.   |
| 2    | `P39-ASSIST-08 Invalidity Coefficient Review`        | Defer    | Invalidity remains member-only and human-review-only and should consume stable injury plus vehicle evidence boundaries.                   |
| 3    | Claim, CRM, handoff, or assistance-session wiring    | Defer    | Workflow side effects require later application-layer gates after the assistance pack contracts stabilize.                                |
| 4    | Runtime vehicle upload or incident-guide UI          | Reject   | UI would collect or display evidence before the pure vehicle contract, privacy alignment, and review boundary are proven.                 |
| 5    | Professional Recovery activation or finance workflow | Reject   | Recovery requires authorization, service agreement, sharing consent, professional review, and finance/audit trail in later bounded gates. |

## Promoted Slice Scope

Authorized implementation scope:

- Add pure `domain-assistance` vehicle damage types, constants, helpers, and tests.
- Reuse existing `AssistanceOutcome`, `VehicleDamagePack`, PII classification, document sensitivity
  class, country-rule metadata, provenance, and fail-closed conventions where possible; define or
  extend vehicle-specific disclaimer codes only when the existing taxonomy is insufficient.
- Align vehicle outputs with `domain-privacy` purpose and consent contracts, especially
  `vehicle_damage_precheck`, `document_upload_processing`, `ai_document_extraction`, and
  `share_with_insurer`; use `share_with_bureau` if ASSIST-07 introduces outbound bureau-sharing
  posture.
- Represent evidence as structured references, category codes, inspection or repair markers, and
  summaries, not raw photos, plate numbers, VINs, police narratives, repair invoices, or insurer
  correspondence.
- Add focused tests for supported member-zone packs; free-zone and Professional-Recovery-like
  inputs; missing/stale/conflicting/incomplete country rules; unsupported country, scenario, role,
  rule family, damage category, or evidence type; low confidence and lowered-threshold attempts;
  missing document-processing, insurer-sharing, or AI-extraction consent; health evidence routed to
  injury/sensitive-health review; out-of-scope valuation/liability/fraud/settlement requests; and
  AI-assisted provenance forcing human review.
- Use synthetic, non-identifiable test fixtures only. Tests must not copy real vehicle photos,
  registration details, plate numbers, VINs, police reports, repair invoices, insurer letters, or
  production-like incident narratives.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.
- Update repo-canonical program/tracker proof for the implementation closeout.
- Reuse the existing exported `MINIMUM_COUNTRY_RULE_CONFIDENCE` constant from `domain-assistance`;
  do not redefine a duplicate floor in ASSIST-07.

The implementation should remain pure domain code. If a direct `@interdomestik/domain-privacy`
import is proposed, the PR must justify why structural alignment is insufficient and prove that the
package boundary stays acyclic, SQL-free, route-free, and side-effect-free.
The expected implementation delta should stay below roughly 80 KB of source/test text unless the PR
body explains why the vehicle damage contract needs more room.

## Vehicle Damage Contract

`P39-ASSIST-07` must treat vehicle damage as a member-zone pre-check, not final damage assessment,
repair-cost valuation, diminished-value valuation, liability allocation, fraud detection, settlement
advice, insurer coverage decision, or Professional Recovery activation.

The contract must be able to represent at least:

- applicable jurisdiction country as the primary rule-selection key;
- incident country, registration country, insurer country, and driver residence as metadata when
  supplied;
- deterministic tie-breaker reason when applicable jurisdiction diverges from incident,
  registration, or insurer-country dimensions;
- vehicle damage scenario and participant role;
- requested vehicle damage rule family;
- damage category codes, inspection readiness markers, and repair/assessment routing markers; the
  first implementation may use bespoke `domain-assistance` codes, while insurer-specific schedules,
  repair-guild codes, ABI categories, or other external damage-code mappings are deferred until a
  later reviewed gate;
- a minimal internal damage-code taxonomy, if needed; this gate does not pin the exact taxonomy,
  but acceptable seed codes could include `panel_damage_reported`, `structural_damage_reported`,
  `total_loss_suspected`, `drivability_compromised`, `glass_only`, and
  `mechanical_damage_reported`;
- explicit input flags for model-unsafe extraction requirements, such as `requiresPlateOcr` and
  `requiresVinOcr`, so ASSIST-07 can detect and reject plate/VIN OCR requests deterministically;
- evidence references as summaries or IDs, not raw photos, plate numbers, VINs, or narratives, for
  example `{ kind: "document_reference", referenceId: "vehicle_damage_photo_ref" }`;
- country-rule metadata and confidence;
- privacy purpose, document-processing consent, insurer-sharing consent when sharing is requested,
  and AI-extraction consent when AI-assisted extraction is modeled;
- insurer/repair/legal disclaimer and human-review requirement;
- AI provenance only when AI assisted extraction or classification.

Outputs must include:

- outcome kind from the existing `AssistanceOutcomeKind` taxonomy;
- damage category codes or reason codes;
- country-rule metadata used;
- required disclaimers, including existing codes such as `not_legal_advice`,
  `not_insurer_assessment`, and `professional_review_required`, plus vehicle-specific codes such as
  `not_repair_estimate`, `not_diminished_value_valuation`, `not_liability_assessment`,
  `not_insurer_coverage_decision`, and `not_fraud_determination` when ASSIST-07 adds them. This
  named set is gate-blessed for ASSIST-07; any additional disclaimer code requires separate
  implementation-PR justification, and tests must fail if the required vehicle disclaimer set is
  reduced without an explicit contract update;
- PII classification, normally `incident_sensitive` for vehicle identifiers, registration details,
  insurer documents, location, police/bureau references, or repair evidence;
- document sensitivity class: use `personal` for ordinary vehicle identifiers, photos,
  registration details, location, towing, and repair evidence; use `legal_professional_recovery`
  when evidence is insurer, bureau, POA, representation, or recovery-adjacent; health facts are not
  classified by the vehicle evaluator and must route to injury/sensitive-health review;
- retention policy key compatible with the privacy foundation;
- provenance and human-review state.

ASSIST-07 should reuse existing outcome kinds: `manual_review_required`, `uncertain`,
`unsupported_country`, `out_of_scope`, `requires_member_zone`, and
`requires_professional_recovery`. This gate does not require new `AssistanceOutcomeKind` values;
any new outcome kind would be a separate contract change that must be justified in the
implementation PR.
Disclaimer values must remain stable domain code identifiers; localized copy belongs to later UI
surfaces.

## Fail-Closed Rules

Vehicle damage pre-checks must fail closed when:

- jurisdiction, scenario, role, or requested rule family is missing;
- required country-rule metadata is missing or incomplete;
- the rule is stale according to the freshness window defined by implementation tests;
- applicable rules are internally conflicting or cross-jurisdiction contradictory;
- country, scenario, role, rule family, evidence type, or damage category code is unsupported;
- confidence is below `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80`;
- the caller attempts to lower the confidence floor;
- document-upload processing consent is missing for vehicle documents;
- insurer-sharing consent is missing when the output would be shared with or prepared for an
  insurer;
- AI provenance is present but the output would be treated as final or non-reviewed;
- health evidence appears and the request tries to process it as ordinary vehicle damage;
- health evidence appears and the output does not use `manual_review_required` with
  `health_evidence_requires_injury_review`;
- plate OCR or VIN OCR is proposed for model-call input, prompt context, logs, metrics, analytics,
  or outbox payloads;
- the input requires repair-cost valuation, diminished-value valuation, fraud determination,
  liability assessment, settlement strategy, insurer coverage decision, legal advice, or
  Professional Recovery judgment.

Fail-closed outputs must resolve to `manual_review_required`, `uncertain`, `unsupported_country`,
`out_of_scope`, `requires_member_zone`, or `requires_professional_recovery` as appropriate. They
must not resolve to final legal, insurer, repair, settlement, recovery, or claim decisions. The
`0.80` floor is inherited from the P39 launch-floor country-rule contract; ASSIST-07 may raise it
but must not lower it.

## Privacy And AI Boundary

The promoted slice must preserve the privacy foundation:

- vehicle documents, images, registration, police, insurer, bureau, repair, or towing evidence
  requires explicit processing purpose and consent expectations;
- bureau references are evidence references only unless a later ASSIST-07 implementation explicitly
  models outbound sharing with the `share_with_bureau` consent key;
- plate numbers, VINs, registration details, location, and insurer documents must not appear in
  logs, metrics, analytics, outbox payloads, or debug traces;
- insurer sharing is not implied by a pre-check and requires explicit sharing consent;
- agent/promoter access to sensitive documents remains denied by design;
- medical or health-sensitive facts encountered during vehicle review must follow injury and
  sensitive-health contracts and must return `manual_review_required` with
  `health_evidence_requires_injury_review` from the vehicle evaluator;
- plate OCR and VIN OCR are not authorized for any model-call surface in ASSIST-07; tests may model
  redacted references only;
- AI may assist extraction or classification only as non-final, no-training, zero-retention,
  human-review-gated input with provenance.

AI behavior is not authorized by this gate. The slice may model provenance for future AI-assisted
inputs, but it must not add model calls, prompt changes, embeddings, retrieval, autonomous actions,
or AI final-decision behavior.
Future UI gates that render disclaimer codes must preserve accessibility, localization, and
plain-language review, but no UI is authorized here.

## Non-Goals

This gate does not authorize:

- product runtime UI or `/member/incident-guide` redesign;
- new upload flow or document storage behavior;
- changes to `apps/web/src/proxy.ts`;
- canonical route changes for `/member`, `/agent`, `/staff`, or `/admin`;
- auth, tenancy, routing, or broad domain architecture refactors;
- database migrations, RLS changes, or consent/document persistence;
- CRM, claim, support-handoff, outbox, event, notification, agreement, POA, billing, or recovery
  record creation;
- direct `domain-crm` imports from `domain-assistance`;
- final repair estimates, diminished-value valuation, total-loss or salvage determination, fault
  attribution, fraud determination, insurer liability or coverage assessment, settlement strategy,
  or final legal advice;
- autonomous AI decisioning, model calls, prompt changes, embeddings, retrieval, plate OCR, or VIN
  OCR;
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, or
  finance-ledger work;
- Stripe;
- README, AGENTS.md, or broad architecture-doc edits.

## Acceptance Criteria For P39-ASSIST-07

- Vehicle damage contracts are public, typed, and covered by focused unit tests.
- The implementation preserves `domain-assistance` as pure rules-first domain code.
- Outputs are member-zone pre-checks and include required legal/insurer/professional disclaimers.
- Supported outputs include country-rule metadata, provenance, PII classification, privacy purpose,
  document sensitivity class, consent/sharing expectations, retention key, and human-review state.
- Missing, stale, conflicting, unsupported, low-confidence, metadata-incomplete,
  privacy-incomplete, and out-of-scope valuation/liability inputs fail closed.
- `MINIMUM_COUNTRY_RULE_CONFIDENCE` remains the launch floor and is not lowered.
- AI is not introduced and cannot be a final decision-maker.
- Tests use synthetic, non-identifiable data and include privacy/consent alignment proof.
- Runtime UI, upload flows, DB migrations, CRM/claim/handoff creation, outbox/event emission, proxy
  edits, canonical route edits, auth/tenancy/routing refactors, and Professional Recovery activation
  remain out of scope.
- The PR includes independent reviewer proof for privacy/consent alignment, insurer/recovery/legal
  boundary, PII/logging discipline, package coupling, and test coverage.

## Implementation Review Plan

When `P39-ASSIST-07` starts, the main agent remains on the critical path and owns final integration.
Because this is an implementation slice with vehicle-document, insurer-sharing, privacy, PII, and
AI-provenance implications, the PR must include independent sidecar review proof for:

- security-owned review of auth, tenancy, privacy, consent, sharing, and PII boundaries;
- product-owned review of repair-valuation, insurer-liability, legal-advice, and human-review
  boundary preservation;
- security plus product review of the vehicle disclaimer-code taxonomy extension and any
  deprecation posture for public domain identifiers;
- security plus product review of AI no-final-decision, no plate/VIN OCR model-call surface, and
  provenance handling;
- platform-owned review of package coupling, green-card adapter boundary, and maintainability;
- QA-owned review of test, plan, and gate coverage.

Independent reviewers are required; use subagents where available, or human/sidecar reviewers where
tooling is unavailable. If reviewer tooling is blocked, the PR must record the blocker and include
the strongest available local fallback review.

## Risks And Open Questions

- High: vehicle damage copy can drift into repair valuation, insurer liability, fraud, or settlement
  advice if future UI wording is not disciplined.
- High: plate numbers, VINs, photos, police reports, and insurer documents can leak personal or
  incident-sensitive facts if logs and test fixtures are careless.
- Medium: insurer-sharing consent may be confused with ordinary document-processing consent.
- Medium: health facts can appear inside vehicle evidence and must be routed to injury/sensitive
  health review instead of processed as ordinary vehicle damage.
- Medium: country-rule freshness and ownership remain operational constraints even when pure tests
  pass.
- Medium: registration country, incident country, applicable jurisdiction, insurer country, and
  driver residence can diverge; ASSIST-07 must keep deterministic rule-selection reasons visible.

Rollback posture: because ASSIST-07 is pure code, an incorrect rule family should be disabled by
reverting or amending the domain rule implementation in a follow-up PR. Runtime kill-switches,
persisted revocation, and rule-administration controls are out of scope for this gate. New
disclaimer codes introduced by ASSIST-07 are public domain identifiers once rendered by later UI;
after that point they should be deprecated rather than removed unless a separate contract migration
authorizes removal.

## Approval Bar

Approve this gate only if reviewers agree that:

- `P39-ASSIST-06` satisfies the contract prerequisite that blocked `P39-ASSIST-07`;
- only `P39-ASSIST-07 Vehicle Damage Pre-check` is promoted;
- the promoted slice is pure domain work inside `packages/domain-assistance`;
- vehicle outputs remain member-zone pre-checks, not repair estimates, diminished-value valuations,
  fault allocation, fraud determinations, insurer coverage decisions, legal advice, or Professional
  Recovery activation;
- privacy purpose, document-processing consent, insurer-sharing consent, AI non-finality,
  document sensitivity class, bureau-sharing separation, no plate/VIN OCR model-call surface, human
  review, retention, redaction, and agent/promoter-denial expectations are explicit;
- DG02 green-card metadata may be referenced without merging green-card eligibility or coverage
  decisions into the vehicle damage evaluator;
- runtime UI, upload flows, persistence, CRM/claim/handoff side effects, Professional Recovery
  activation, and later assistance DGs remain blocked until separately promoted.

## Completion State

| Item                                      | State    | Notes                                                                  |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `P39-ASSIST-06 Injury Category Pre-check` | complete | Provides injury/privacy boundary proof for vehicle evidence handling.  |
| `P39-DG07 Vehicle Damage Pre-check`       | complete | Closes ASSIST-06 and resumes the ordinary P39 assistance sequence.     |
| `P39-ASSIST-07 Vehicle Damage Pre-check`  | promoted | Pure member-zone domain slice; no runtime UI or workflow side effects. |
| `P39-ASSIST-08` through recovery work     | reserved | No implementation authority from this gate.                            |

## Verification

Required local verification for this gate:

```bash
git diff --check
pnpm plan:status
pnpm track:audit
pnpm plan:audit
pnpm docs:verify
pnpm repo:size:check
```

No product test suite is required for this docs/design-gate slice unless docs tooling or repo-size
guards require it.
Implementation tests run in the promoted ASSIST-07 PR, not this design-gate PR.
This design-gate PR should remain a docs/budget-only delta; any larger source/test budget increase
belongs to the promoted ASSIST-07 implementation PR.
