# P39-ASSIST-00 Program Spec And Domain Contracts

Status: complete
Slice: `P39-ASSIST-00`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-17
Authority: repo-canonical contracts/spec slice promoted by `P39-DG01 IDA Assistance And
Recovery Program Design Gate`.

Status vocabulary: `complete` records that the contracts/spec slice is approved. Tracker queue
statuses remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C constraints remain active. `apps/web/src/proxy.ts` remains read-only routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, broad domain architecture, Stripe, README,
AGENTS.md, or broad architecture-doc change is authorized by this slice.

## Predecessor Dependency

`P39-DG01` is the direct predecessor. It was created in PR `#804` and hardened in PR `#805`.

Predecessor proof:

- `P38-DG22 CRM23 And CRM Foundation Closeout` landed through PR `#794`, merge commit
  `bb3657825f58129e843741ddca95e0f1e214b8a8`.
- `P39-DG01 IDA Assistance And Recovery Program Design Gate` landed through PR `#804`, merge
  commit `ac03e082cc573d7b2b91f921f4ef2bc43e2c1545`.
- `P39-DG01` hardening landed through PR `#805`, merge commit
  `80f3f2a273824d287b4db882571ae059afdb3af5`.
- External tracker sync for the hardening pass is recorded at
  `https://www.notion.so/363036cff1f881e5b17ac620b3f50b5f`.

P39 remains the active assistance/recovery program. P38 remains closed and none of the deferred P38
CRM items are reopened by this slice.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Existing Help Now / incident guide surface:
  `apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx`.
- Existing country guidance package: `packages/domain-country-guidance/src/types.ts`,
  `packages/domain-country-guidance/src/data.ts`, and
  `packages/domain-country-guidance/src/service.ts`.
- Claims and handoff integration targets: `packages/domain-claims/src/claims/`,
  `packages/domain-claims/src/support-handoffs/`, and
  `packages/domain-claims/src/staff-claims/`.
- AI extraction/classification boundary: `packages/domain-ai/src/types.ts`,
  `packages/domain-ai/src/models.ts`, and `packages/domain-ai/src/telemetry.ts`.
- Membership billing and recovery-finance targets: `packages/domain-membership-billing/src/`,
  `packages/domain-membership-billing/src/success-fees/policy.ts`, and
  `apps/web/src/components/commercial/success-fee-calculator.tsx`.
- Recovery decision and agreement surfaces:
  `packages/domain-claims/src/staff-claims/recovery-decision.ts`,
  `packages/domain-claims/src/staff-claims/accepted-recovery-prerequisites.ts`,
  `packages/domain-claims/src/staff-claims/save-escalation-agreement.ts`,
  `apps/web/src/components/staff/claim-action-panel/recovery-decision-section.tsx`, and
  `apps/web/src/components/staff/claim-action-panel/accepted-recovery-prerequisites-section.tsx`.

## Slice Decision

`P39-ASSIST-00` completes the program specification and domain contract plan required before any
assistance runtime work begins.

This slice promotes exactly one next bounded implementation slice:

`P39-ASSIST-01 domain-assistance Core Package`

`P39-ASSIST-01` is limited to the pure `packages/domain-assistance/` package skeleton, public type
contracts, pure rule/outcome helpers needed to prove those contracts, and focused contract tests. It
does not authorize product runtime callers, Help Now UI behavior, member/staff UI redesign, database
migrations, CRM/claim/handoff creation, country-guidance schema changes, outbox/event publishing,
Professional Recovery activation, autonomous AI decisioning, proxy edits, canonical route changes, or
auth/tenancy/routing refactors.

## Domain Package Contract

The future package location is pinned as `packages/domain-assistance/`.

`domain-assistance` is a pure rules-first package:

- no direct `domain-crm` import;
- no SQL or database adapter import;
- no CRM, claim, support-handoff, billing, agreement, document, consent, finance, outbox, event, or
  notification record creation;
- pure functions with explicit typed inputs and outputs;
- injected clock and ID generation wherever time or identifiers are required;
- port-based external dependencies only when pure data lookup is unavoidable;
- in-memory adapter tests for ports;
- aggregate-only or identifier-minimal diagnostics, never raw PII.

The domain returns typed outcomes and packs only. Application/workflow layers consume those outputs
later.

## Minimum Outcome Taxonomy

`AssistanceOutcome` must be a discriminated union with at least the following variants:

```ts
type AssistanceOutcomeKind =
  | 'eligible'
  | 'ineligible'
  | 'manual_review_required'
  | 'uncertain'
  | 'unsupported_country'
  | 'out_of_scope'
  | 'requires_member_zone'
  | 'requires_professional_recovery';
```

Every outcome must carry:

- `kind`;
- `reasons`, as stable machine-readable reason codes plus localized-copy keys where useful;
- `evidence`, as structured references, not raw uploads or unredacted narratives;
- `countryRuleMetadata` when country rules influenced the outcome;
- `humanReviewRequired`;
- `disclaimers`;
- `provenance`, including AI provenance only when AI assisted extraction or classification;
- `createdAt`, provided by an injected clock.

`eligible` and `ineligible` are pre-check classifications only. They are not final legal, medical,
insurer, settlement, finance, or recovery decisions.

## Pack Contracts

Each pack is a typed, evidence-preserving pre-check artifact. Pack names are canonical:

- `IncidentScenePack`: free-zone incident scene guidance, evidence checklist, immediate safety
  prompts, and escalation recommendation.
- `LegalBasisPack`: member-zone legal-basis pre-check with rule references, confidence metadata,
  disclaimer, and mandatory review markers for uncertainty.
- `ProcedurePack`: procedural guidance keyed by country, claim type, deadlines, and source metadata.
- `InjuryCategoryPack`: member-zone injury category pre-check that never stores or logs raw medical
  narrative outside authorized boundaries.
- `VehicleDamagePack`: member-zone vehicle damage pre-check with evidence references and
  repair/assessment routing markers.
- `InvalidityReviewPack`: member-only, human-review-only review artifact for invalidity coefficient
  handling. It cannot be generated as free-zone automation and cannot be final without human review.
- `RecoveryEligibilityPack`: member or Professional Recovery pre-check that may recommend
  `requires_professional_recovery`, but cannot activate recovery itself.

All packs must include:

- `packType`;
- `outcome`;
- `zone`;
- `inputsSummary`, redacted and structured;
- `requiredDisclaimers`;
- `requiredHumanReview`;
- `countryRuleMetadata` when country-specific rules were used;
- `piiClassification`;
- `retentionPolicyKey`, initially a placeholder until `P39-ASSIST-15`;
- `provenance`.

## Country Rules And Confidence Policy

Every country-specific rule must carry:

- `country`;
- `sourceReference`;
- `owner`;
- `lastReviewed`;
- `confidence`.

The launch-floor numeric threshold is pinned at `0.80`.

Rules with `confidence < 0.80` must fail closed into `manual_review_required`, `uncertain`, or
`unsupported_country`, depending on the reason. A rule at or above `0.80` still fails closed when it
is missing, stale, internally conflicting, unsupported for the requested scenario, or contradicted by
another applicable jurisdiction. `0.80` is a conservative pre-check floor, not a guarantee of legal
correctness. `P39-ASSIST-03` may raise the threshold by country, rule family, or Green Card scenario,
but cannot lower it without a later repo-canonical gate and legal/professional review.

The defensibility record for this threshold is:

- P39 outputs are pre-checks, not final advice;
- high-stakes legal, medical, finance, and Professional Recovery decisions remain human-reviewed;
- missing/stale/conflicting rules fail closed even above the numeric floor;
- insurers and counterparties must not be able to treat a platform output as a final eligibility
  representation.

`P39-ASSIST-03` is the only currently reserved slice authorized to modify or adapt
`packages/domain-country-guidance`. Until then, P39 slices may consume the existing package shape
read-only through an adapter contract.

## Service Zones

P39 has three commercial and liability zones:

- Free zone: Help Now and first incident-scene guidance. It is educational, evidence-preserving,
  routing-oriented, and does not require PII.
- Member zone: authenticated saved assistance sessions, legal/procedure/injury/vehicle pre-checks,
  invalidity review requests, and human-review workflows under existing auth and tenancy boundaries.
- Professional Recovery Mode: authorized, agreement-backed, consented, professionally reviewed, and
  finance/audit-trailed recovery work.

Help Now is the first free-zone entry. Green Card is a strategic track and must not be collapsed into
generic incident guidance. Invalidity coefficient review is member/human-review only. Services 7-10
and later recovery execution require Professional Recovery Mode controls before activation.

Canonical naming:

- Product-facing term: `Help Now`; internal entry label: `help_now`.
- Product-facing term: `Professional Recovery Mode`; internal mode label: `professional_recovery`.

## Disclaimer Contract

Free-zone outputs must carry fixed localized disclaimer text that the output is not legal advice, not
medical advice, not an insurer assessment, and not a professional opinion. The output is educational,
evidence-preserving, and routing-oriented only.

Member-zone outputs may include member-specific context and saved assistance history, but still carry
localized educational/not-professional-advice disclaimer text. They must not present pre-check
classification as final eligibility, final liability, final injury assessment, final compensation
amount, or final insurer position.

Professional Recovery Mode outputs that constitute legal, medical, financial, settlement, or recovery
advice must be produced under an authorized professional's review. The professional, not platform
automation or AI, is the advice surface.

This discipline protects regulatory posture and insurer/counterparty dispute posture. A platform
pre-check must not prejudice or appear to replace an insurer's assessment, a professional legal
opinion, a medical assessment, or a settlement decision.

## PII And Sensitive Data Contract

P39 handles incident, legal, financial, vehicle, and health-adjacent data. The governing risk is
broader than GDPR and may include jurisdiction-specific medical-data laws, professional secrecy,
legal privilege, insurer-data-sharing restrictions, and evidence custody duties.

Required discipline:

- Free-zone Help Now must render first guidance without requiring PII.
- Anonymous or unauthenticated free-zone sessions must not create member-zone, claim, CRM, handoff,
  agreement, billing, consent, or recovery records.
- Member-zone outputs may handle PII only after existing auth and tenancy boundaries resolve. This
  slice authorizes no new PII storage path.
- Professional Recovery may handle medical, legal, financial, and incident PII only after later
  slices document retention, access-control, professional secrecy, privilege, and evidence-custody
  rules.
- Logs, metrics, analytics, outbox payloads, support events, and debug traces must not include raw
  injury descriptions, medical facts, legal theories, financial terms, evidence details, or incident
  narratives.

`P39-ASSIST-15 Consent And Retention` is reserved for detailed retention, deletion, subject-access,
privilege, and evidence-custody contracts.

## Help Now Escalation

The free-to-member boundary is the most leak-prone surface.

When Help Now detects a member-zone or Professional Recovery need:

- return immediate educational/safety guidance and a clear escalation recommendation;
- preserve only an anonymous digest unless the user is authenticated and explicitly consents to
  attach the session;
- offer a CTA to member-zone assistance or staff handoff;
- never create a member-zone record, CRM lead, claim, support handoff, agreement, consent record,
  billing record, or recovery record automatically from a free-zone session;
- carry disclaimer text through the escalation CTA and any saved digest.

Serious injury or urgent emergency indicators may trigger safety-first guidance and emergency-service
copy, but still do not authorize platform legal/medical conclusions.

## Professional Recovery Authorization Model

Professional Recovery state is an evidentiary audit chain, not just workflow polish:

`requested` -> `authorization_pending` -> `agreement_pending` -> `consent_recorded` ->
`professional_review_pending` -> `active_recovery` -> `settlement_or_resolution_pending` -> `closed`

Minimum activation rights:

- Member: may request Professional Recovery and provide consent.
- Staff: may prepare intake, validate completeness, and route for professional review.
- Authorized professional: must approve legal-recovery activation and any final legal-advice surface
  for the relevant jurisdiction.
- Finance or operations: may record ledger and audit artifacts only after prerequisites are met; they
  cannot activate recovery alone.

Minimum evidence per transition:

- actor and role;
- tenant/member scope;
- timestamp from an injected clock or trusted application layer;
- jurisdiction;
- agreement/authorization/consent references where required;
- professional review reference where required;
- finance/audit reference where required.

Later Professional Recovery slices must account for jurisdiction-specific licensing or regulator
requirements before representation, POA acceptance, settlement handling, expert-cost authorization,
success-fee collection, or final legal advice is surfaced.

## Human Review And AI Boundaries

Human review is mandatory for:

- invalidity coefficient review;
- uncertain, missing, stale, conflicting, unsupported, or low-confidence country rules;
- disputed legal-basis or procedure outputs;
- injury and vehicle-damage outputs that affect recovery eligibility;
- Professional Recovery activation;
- agreement, authorization, POA, expert-cost, success-fee, settlement, or recovery-finance decisions.

AI may assist only with extraction, classification, summarization, and draft organization. AI must not
be the final decision-maker for legal basis, eligibility, invalidity coefficient, recovery activation,
agreement sufficiency, POA sufficiency, expert-cost authorization, success-fee collection,
settlement, or claim/CRM/handoff creation.

AI-assisted inputs must carry provenance:

- `aiConfidence`;
- `aiModelVersion`;
- `aiWorkflowName`;
- `aiPromptOrSchemaVersion`;
- `aiRunId`.

If `domain-ai` already exposes equivalent names during implementation, `domain-assistance` may map to
those existing names. The provenance requirement remains mandatory.

## Integration Wire Shape

`domain-assistance` returns a typed digest for later workflow composition. The high-level contract is
`AssistanceSessionDigest`.

Minimum digest fields:

- `sessionId`;
- `zone`;
- `memberId`, optional and present only after authenticated explicit attachment;
- `country`;
- `packSummaries`;
- `outcomes`;
- `escalationRecommendation`;
- `consentState`;
- `requiredHumanReview`;
- `disclaimersShown`;
- `countryRuleMetadata`;
- `aiProvenance`, when applicable;
- `piiClassification`;
- `createdAt`.

`P39-ASSIST-09` may consume this digest in an application/workflow composer. That composer, not
`domain-assistance`, decides whether to create or link CRM leads, claims, support handoffs, billing
records, agreement records, consent records, or finance/audit records.

Outbox and event emission remain out of scope for the pure domain package. Typed domain events, if
needed, require a later gate.

## P39-ASSIST-01 Implementation Contract

The next implementation slice, `P39-ASSIST-01`, may create only:

- `packages/domain-assistance/` package metadata consistent with existing domain packages;
- public type exports for `AssistanceOutcome`, assistance packs, country-rule metadata, disclaimers,
  AI provenance, service zones, and `AssistanceSessionDigest`;
- pure helper functions necessary to validate fail-closed outcome selection and review-required
  markers;
- focused unit tests for the contract helpers;
- package and workspace metadata required for the package to type-check.

`P39-ASSIST-01` must prove:

- no direct `domain-crm` import from `packages/domain-assistance`;
- no SQL/database imports inside `packages/domain-assistance`;
- no app, UI, route, proxy, auth, tenancy, schema, migration, billing, outbox, event, or notification
  changes;
- fail-closed behavior for missing, stale, conflicting, unsupported, and `< 0.80` confidence rules;
- invalidity coefficient remains member/human-review only;
- AI provenance is typed but AI is never final decision-maker;
- Help Now can return a free-zone outcome without PII;
- `AssistanceSessionDigest` can represent consented escalation without creating external records.

## Risks And Open Questions

- The `0.80` launch-floor confidence threshold is defensible only as a pre-check floor; legal review
  may raise it or require per-country thresholds.
- Country-rule ownership, refresh cadence, and stale-rule SLA still need `P39-ASSIST-03` detail.
- Disclaimer copy must be localized and legal-reviewed before runtime UI output.
- PII retention, deletion, subject-access, professional secrecy, privilege, and evidence custody are
  reserved for `P39-ASSIST-15`.
- Green Card cross-jurisdiction conflicts can produce multi-country rule contradictions and must fail
  closed.
- Insurers and counterparties may challenge platform-derived eligibility language; output copy must
  remain pre-check and non-final until professional review.
- Professional Recovery licensing rules may vary by country, claim type, and representation posture.

## Non-Goals

This slice does not authorize:

- product runtime implementation beyond the later `P39-ASSIST-01` package contract slice;
- any `apps/web` UI redesign or Help Now runtime behavior;
- `apps/web/src/proxy.ts` changes;
- canonical route changes or bypasses for `/member`, `/agent`, `/staff`, or `/admin`;
- auth/session layering, tenancy architecture, routing architecture, or broad domain architecture
  refactors;
- database migrations, schema changes, RLS changes, or persistence paths;
- Stripe usage in V3 pilot flows;
- direct `domain-assistance` imports from `domain-crm`;
- CRM/claim/handoff creation inside `domain-assistance`;
- outbox/event emission from `domain-assistance`;
- autonomous AI decisioning;
- README, AGENTS.md, or broad architecture-doc updates.

## Acceptance Criteria

This slice is complete when it records:

- the `packages/domain-assistance/` location and pure rules-first package discipline;
- minimum `AssistanceOutcome` taxonomy;
- assistance pack contracts;
- country-rule metadata requirements and `0.80` launch-floor confidence threshold;
- fail-closed behavior for missing, stale, conflicting, unsupported, and low-confidence rules;
- `domain-country-guidance` read-only adapter strategy until `P39-ASSIST-03`;
- disclaimer contract by zone;
- PII, logging, retention, and sensitive-data boundaries;
- free/member/Professional Recovery service boundaries;
- Help Now explicit-consent escalation boundary;
- Professional Recovery state model, activation rights, and licensing-review placeholders;
- human-review and AI-limited-role boundaries;
- AI provenance fields;
- `AssistanceSessionDigest` integration wire shape;
- no-direct-CRM-import and no-outbox/event-emission stance;
- bounded implementation contract and proof plan for `P39-ASSIST-01`.

## Verification For This Slice

Required local verification for this docs-only slice:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm ci:local:quick`

No product test suite is required because this slice changes planning documents only.
