# P39-DG06 Injury Category Pre-check Design Gate

Status: complete
Slice: `P39-DG06`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-18
Authority: repo-canonical closeout and promotion gate. This document closes `P39-PRIV01`
and promotes exactly one next implementation slice:
`P39-ASSIST-06 Injury Category Pre-check`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` remains the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                      |
| -------- | ---------- | ------------------------------------------ |
| `r1`     | 2026-05-18 | Initial approved DG06 promotion record.    |
| `r2`     | 2026-05-18 | Design-review clarifications before merge. |

## Definitions

- Article 9: GDPR special-category data posture for health data; this gate uses GDPR as the privacy
  floor for injury work, and non-EU jurisdictions must inherit at least the same floor unless a
  later privacy gate raises it.
- DPIA: data protection impact assessment.
- DSR: data-subject request, including export and erasure requests.
- RLS: database row-level security; this gate does not authorize database or RLS changes.
- POA: power of attorney; this gate does not authorize POA collection or representation.
- Outbox: application event/publication mechanism; this gate does not authorize outbox writes.
- Professional Recovery: the later authorized, consented, agreement-backed recovery mode; this gate
  does not activate it.
- `AssistanceOutcomeKind`: the existing `domain-assistance` outcome taxonomy used by assistance
  packs.

## Predecessor Dependency

`P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation` is the direct predecessor for this
gate.

Predecessor proof:

- `P39-DG05 Privacy, Consent, And Sensitive Document Governance Design Gate` is recorded in
  `docs/plans/2026-05-18-p39-dg05-privacy-consent-sensitive-document-governance.md`.
- `P39-PRIV01` landed through PR `#815`, merge commit
  `8bb817a2d3f1e3046791e93416681b41149a7d13`.
- `P39-PRIV01` added the pure `@interdomestik/domain-privacy` package and focused proof for
  consent, document sensitivity, role access, AI extraction boundaries, DSR deadlines, and DPIA
  posture.

`P39-PRIV01` is contract-only. It does not authorize runtime UI, upload flows, database
migrations/RLS, CRM/claim/handoff creation, outbox/event emission, Professional Recovery
activation, autonomous AI decisioning, proxy/canonical route/auth/tenancy/routing changes, Stripe,
README, AGENTS, or broad architecture-doc work.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Procedure guide gate:
  `docs/plans/2026-05-18-p39-dg04-procedure-guide-design.md`.
- Privacy gate:
  `docs/plans/2026-05-18-p39-dg05-privacy-consent-sensitive-document-governance.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Assistance package contracts: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/procedure-guide.ts`, and existing focused tests.
- Privacy package contracts: `packages/domain-privacy/src/types.ts`,
  `packages/domain-privacy/src/consent.ts`, `packages/domain-privacy/src/documents.ts`,
  `packages/domain-privacy/src/access.ts`, and `packages/domain-privacy/src/ai.ts`.

## Decision

Promote exactly one implementation slice:

`P39-ASSIST-06 Injury Category Pre-check`

The promoted slice must implement a bounded member-zone, rules-first injury category pre-check in
`packages/domain-assistance`. It may define injury category rule families, severity bands,
evidence-reference contracts, consent/privacy alignment metadata, readiness outputs, and pack
creation helpers. It must not create product runtime UI, upload flows, persistence, claims, CRM
handoffs, outbox events, Professional Recovery activation, autonomous AI decisions, or medical/legal
final advice.

`P39-ASSIST-06` must consume the `P39-PRIV01` foundation as a contract boundary: injury outputs that
involve medical or health data must carry explicit purpose, sensitivity, consent, Article 9,
human-review, retention, and AI non-finality expectations. The implementation may keep this as
structural contract alignment rather than a runtime dependency if that best preserves pure package
boundaries. Structural alignment must use exact shared contract keys from `domain-privacy`, including
`injury_category_precheck`, `sensitive_health`, `medical_document_processing`, and
`ai_document_extraction`; the implementation PR should include focused tests or contract snapshots
that fail if those keys drift.

## Candidate Ranking

| Rank | Candidate                                            | Decision | Rationale                                                                                                                                                     |
| ---- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P39-ASSIST-06 Injury Category Pre-check`            | Promote  | The privacy foundation now names the required medical consent, sensitivity, AI, access, DSR, and DPIA contracts needed before the injury pack can be modeled. |
| 2    | `P39-ASSIST-07 Vehicle Damage Pre-check`             | Defer    | Vehicle damage should follow injury because it has lower special-category health exposure but still needs the same evidence and privacy discipline.           |
| 3    | `P39-ASSIST-08 Invalidity Coefficient Review`        | Defer    | Invalidity remains member-only and human-review-only; it depends on injury category boundaries and should not be promoted first.                              |
| 4    | Runtime injury upload or incident-guide UI           | Reject   | UI would collect or display sensitive health data before the pure injury contract and review boundary are proven.                                             |
| 5    | Claim, CRM, handoff, or Professional Recovery wiring | Reject   | Workflow side effects require later application-layer gates and cannot be introduced by a domain pre-check slice.                                             |

## Promoted Slice Scope

Authorized implementation scope:

- Add pure `domain-assistance` injury category types, constants, helpers, and tests.
- Reuse existing `AssistanceOutcome`, `InjuryCategoryPack`, disclaimer, PII classification,
  country-rule metadata, provenance, and fail-closed conventions where possible.
- Align injury outputs with `domain-privacy` purpose and sensitivity contracts, especially
  `injury_category_precheck`, `sensitive_health`, `medical_document_processing`, and
  `ai_document_extraction`.
- Represent evidence as structured references, category codes, severity bands, and summaries, not
  raw medical narratives.
- Add focused tests for:
  - supported member-zone packs;
  - free-zone escalation and Professional-Recovery-like inputs;
  - missing jurisdiction, missing rules, metadata-incomplete rules, stale rules, and conflicting
    rules;
  - unsupported country, scenario, role, family, or category;
  - low confidence and lowered-threshold attempts;
  - out-of-scope medical assessment;
  - privacy or consent missing states;
  - AI-assisted provenance forcing human review.
- Use synthetic, non-identifiable test fixtures only. Tests must not copy real case narratives,
  medical documents, claimant facts, insurer correspondence, or production-like health histories.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.
- Update repo-canonical program/tracker proof for the implementation closeout.

The implementation should remain pure domain code. If a direct `@interdomestik/domain-privacy`
import is proposed, the PR must justify why structural alignment is insufficient and prove that the
package boundary stays acyclic, SQL-free, route-free, and side-effect-free.
The expected implementation delta should stay below roughly 80 KB of source/test text unless the PR
body explains why the injury contract needs more room.

## Injury Category Contract

`P39-ASSIST-06` must treat injury category as a member-zone pre-check, not medical diagnosis, final
injury assessment, compensation advice, invalidity coefficient decision, insurer liability decision,
or Professional Recovery activation.

The contract must be able to represent at least:

- applicable jurisdiction country as the primary rule-selection key;
- incident country as metadata when it differs from the applicable jurisdiction;
- a deterministic tie-breaker reason when incident country and applicable jurisdiction diverge;
- injury scenario and participant role;
- requested injury rule family;
- injury category codes or severity bands; the first implementation may use bespoke
  `domain-assistance` codes, while ICD or other medical-code-system mapping is deferred until a
  later medically reviewed gate;
- evidence references as summaries or IDs, not raw health narratives;
- country-rule metadata and confidence;
- privacy purpose, sensitivity, and consent requirement metadata;
- medical/health disclaimer and human-review requirement;
- AI provenance only when AI assisted extraction or classification.

Outputs must include:

- outcome kind from the existing `AssistanceOutcomeKind` taxonomy;
- injury category codes or reason codes;
- country-rule metadata used;
- required disclaimers, including `not_medical_advice`, `not_legal_advice`,
  `not_insurer_assessment`, and `professional_review_required` when applicable;
- PII classification, normally `medical_sensitive` when health facts are involved;
- retention policy key compatible with the privacy foundation;
- provenance and human-review state.

ASSIST-06 should reuse existing outcome kinds: `manual_review_required`, `uncertain`,
`unsupported_country`, `out_of_scope`, `requires_member_zone`, and
`requires_professional_recovery`. This gate does not require new `AssistanceOutcomeKind` values; any
new outcome kind would be a separate contract change that must be justified in the implementation PR.
Disclaimer values must remain stable domain code identifiers. Localized copy belongs to later UI
surfaces, not the domain boundary.

## Fail-Closed Rules

Injury pre-checks must fail closed when:

- jurisdiction, scenario, role, or requested rule family is missing;
- required country-rule metadata is missing or incomplete;
- the rule is stale, meaning `lastReviewed` or a future explicit `validUntil` / version field is
  outside the freshness window defined by the implementation tests;
- applicable rules are internally conflicting or cross-jurisdiction contradictory;
- country, scenario, role, rule family, or injury category code is unsupported;
- confidence is below `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80`;
- the caller attempts to lower the confidence floor;
- medical-document consent or Article 9 posture is missing where sensitive health evidence is
  involved;
- AI provenance is present but the output would be treated as final or non-reviewed;
- the input requires medical diagnosis, prognosis, invalidity coefficient calculation, treatment
  advice, compensation valuation, insurer liability assessment, or professional recovery judgment.

Fail-closed outputs must resolve to `manual_review_required`, `uncertain`, `unsupported_country`,
`out_of_scope`, `requires_member_zone`, or `requires_professional_recovery` as appropriate. They
must not resolve to final medical, legal, insurer, settlement, recovery, or claim decisions.
The `0.80` floor is inherited from the P39 launch-floor country-rule contract and remains a
calibration floor pending later production evidence; ASSIST-06 may raise it but must not lower it.

## Privacy And AI Boundary

The promoted slice must preserve the privacy foundation:

- medical or health-sensitive inputs require explicit purpose and consent expectations;
- agent/promoter access to sensitive injury evidence remains denied by design;
- AI may assist extraction or classification only as non-final, no-training, zero-retention,
  human-review-gated input with provenance;
- outputs must not expose raw medical facts in logs, metrics, analytics, outbox payloads, or
  debug traces;
- DPIA-required posture must be preserved for broad runtime exposure of sensitive injury flows.

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
- medical diagnosis, treatment advice, invalidity coefficient calculation, compensation valuation,
  insurer liability assessment, or final legal advice;
- autonomous AI decisioning or new AI workflows;
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, or
  finance-ledger work;
- Stripe;
- README, AGENTS.md, or broad architecture-doc edits.

## Acceptance Criteria For P39-ASSIST-06

- Injury category contracts are public, typed, and covered by focused unit tests.
- The implementation preserves `domain-assistance` as pure rules-first domain code.
- Outputs are member-zone pre-checks and include required medical/legal/insurer disclaimers.
- Supported outputs include country-rule metadata, provenance, PII classification, privacy purpose,
  consent/sensitivity expectations, retention key, and human-review state.
- Missing, stale, conflicting, unsupported, low-confidence, metadata-incomplete, privacy-incomplete,
  and out-of-scope medical inputs fail closed.
- `MINIMUM_COUNTRY_RULE_CONFIDENCE` remains the launch floor and is not lowered.
- AI is not introduced and cannot be a final decision-maker.
- Tests use synthetic, non-identifiable data and include privacy/consent alignment proof.
- The implementation does not introduce runtime UI, upload flows, DB migrations, CRM/claim/handoff
  creation, outbox/event emission, proxy edits, canonical route edits, auth/tenancy/routing
  refactors, or Professional Recovery activation.
- The PR includes independent reviewer proof for privacy/consent alignment, medical-liability
  boundary, PII/logging discipline, package coupling, and test coverage.

## Implementation Review Plan

When `P39-ASSIST-06` starts, the main agent remains on the critical path and owns final integration.
Because this is an implementation slice with health-data, medical-liability, privacy, consent, and
AI-provenance implications, the PR must include independent sidecar review proof for:

- security-owned review of auth, tenancy, privacy, consent, and PII boundaries;
- product-owned review of medical-liability, disclaimer, and human-review boundary preservation;
- security plus product review of AI no-final-decision and provenance handling;
- platform-owned review of package coupling and maintainability;
- QA-owned review of test, plan, and gate coverage.

Independent reviewers are required; use subagents where available, or human/sidecar reviewers where
tooling is unavailable. If reviewer tooling is blocked, the PR must record the blocker and include
the strongest available local fallback review.

## Risks And Open Questions

- High: injury category copy can drift into medical assessment if future UI wording is not
  disciplined.
- High: jurisdiction-specific medical-data and limitation rules may require legal/professional
  review before broad runtime exposure.
- Medium: country-rule freshness and ownership remain operational constraints even when pure tests
  pass.
- Medium: invalidity coefficient and compensation valuation must stay behind later
  member/human-review gates.
- High: a future runtime upload or AI extraction slice needs DPIA, DPA/vendor, retention, and
  access-log proof before sensitive injury documents are processed live.

Rollback or revocation posture: because ASSIST-06 is pure code, an incorrect rule family should be
disabled by reverting or amending the domain rule implementation in a follow-up PR. Runtime
kill-switches, persisted revocation, and rule-administration controls are out of scope for this gate.

## Approval Bar

Approve this gate only if reviewers agree that:

- `P39-PRIV01` satisfies the contract prerequisite that blocked `P39-ASSIST-06`;
- only `P39-ASSIST-06 Injury Category Pre-check` is promoted;
- the promoted slice is pure domain work inside `packages/domain-assistance`;
- injury outputs remain member-zone pre-checks, not medical diagnosis, legal advice, insurer
  assessment, invalidity review, compensation valuation, or Professional Recovery activation;
- privacy-zone, sensitive-health, consent, Article 9, AI non-finality, human-review, retention, and
  agent/promoter-denial expectations are explicit;
- runtime UI, upload flows, persistence, CRM/claim/handoff side effects, Professional Recovery
  activation, and later assistance DGs remain blocked until separately promoted.

## Completion State

| Item                                                             | State    | Notes                                                                  |
| ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `P39-PRIV01 Privacy, Consent, And Sensitive Document Foundation` | complete | Provides the contract prerequisite for sensitive injury pre-checks.    |
| `P39-DG06 Injury Category Pre-check Design Gate`                 | complete | Closes PRIV01 and resumes the ordinary P39 assistance sequence.        |
| `P39-ASSIST-06 Injury Category Pre-check`                        | promoted | Pure member-zone domain slice; no runtime UI or workflow side effects. |
| `P39-ASSIST-07` through recovery runtime work                    | reserved | No implementation authority from this gate.                            |

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
This design-gate PR should remain a docs/budget-only delta; any larger source/test budget increase
belongs to the promoted ASSIST-06 implementation PR.
