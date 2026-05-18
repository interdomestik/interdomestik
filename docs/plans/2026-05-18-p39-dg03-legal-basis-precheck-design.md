# P39-DG03 Legal Basis Pre-check Design Gate

Status: complete
Slice: `P39-DG03`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-18
Authority: repo-canonical closeout and promotion gate. This document closes `P39-ASSIST-03`
and promotes exactly one next implementation slice: `P39-ASSIST-04 Legal Basis Pre-check`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Predecessor Dependency

`P39-ASSIST-03 Green Card / Country Rules Adapter` is the direct predecessor for this gate.

Predecessor proof:

- `P39-ASSIST-03` landed through PR `#810`, merge commit
  `fdef78f32f10f87a9067fd2346e76784eea45222`.
- Closeout sync proof is recorded in Notion at
  `https://www.notion.so/364036cff1f8815ba34ff05cc94d3845`.
- `P39-DG02` is recorded in
  `docs/plans/2026-05-18-p39-dg02-green-card-country-rules-adapter-design.md` and promoted only
  `P39-ASSIST-03`.
- `P39-ASSIST-00 Program Spec And Domain Contracts` remains the governing contract for disclaimer,
  PII, country-rule metadata, confidence, fail-closed, human-review, AI, and Professional Recovery
  boundaries.

`P39-ASSIST-03` is closed as a pure Green Card country-rule readiness slice. It does not authorize
legal-basis implementation beyond this gate, does not reopen Help Now UI, and does not move CRM,
claim, support-handoff, Professional Recovery, agreement, POA, expert-cost, or success-fee work into
active scope.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Green Card gate: `docs/plans/2026-05-18-p39-dg02-green-card-country-rules-adapter-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Pure assistance contracts: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/country-rules.ts`,
  `packages/domain-assistance/src/rules/green-card.ts`,
  `packages/domain-assistance/src/rules/help-now.ts`, and existing focused tests.
- Existing country-guidance package remains a read-only source-shape reference:
  `packages/domain-country-guidance/src/types.ts`, `packages/domain-country-guidance/src/data.ts`,
  and `packages/domain-country-guidance/src/service.ts`.

## Candidate Ranking

| Rank | Candidate                                                      | Decision             | Rationale                                                                                                                                                                                     |
| ---- | -------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P39-ASSIST-04 Legal Basis Pre-check`                          | Promote              | Legal-basis pre-check is the next member-zone domain pack after Green Card readiness; it must be pinned as rules-first and human-review-safe before procedure, injury, vehicle, or UI slices. |
| 2    | `P39-ASSIST-05 Procedure Guide`                                | Defer                | Procedure guidance depends on a bounded legal-basis pre-check contract so deadlines and next steps do not imply unsupported legal conclusions.                                                |
| 3    | `P39-ASSIST-06` / `P39-ASSIST-07` injury or vehicle pre-checks | Defer                | Medical and vehicle-damage pre-checks have higher PII and liability exposure and should consume a stable legal-basis boundary rather than define it implicitly.                               |
| 4    | Runtime member/staff UI for assistance packs                   | Reject for this gate | UI would introduce copy, accessibility, routing, auth, tenancy, persistence, and disclaimer surfaces before the legal-basis domain contract is proven.                                        |
| 5    | CRM/claim/handoff or Professional Recovery activation          | Reject               | `P39-ASSIST-09` through `P39-ASSIST-12` remain later workflow and recovery-mode slices requiring consent, authorization, agreements, professional custody, and finance/audit evidence.        |

## Promoted Slice

Promote exactly one implementation slice:

`P39-ASSIST-04 Legal Basis Pre-check`

The slice must introduce a bounded member-zone legal-basis pre-check contract inside
`packages/domain-assistance/`. It must return typed `LegalBasisPack` or readiness-style outcomes
that are educational, pre-check, and human-review-aware. It must not produce final legal advice,
final eligibility, insurer assessment, claim acceptance, recovery activation, or representation.

Authorized implementation scope:

- Add or extend pure `domain-assistance` legal-basis types, constants, helpers, and tests.
- Reuse existing `AssistanceOutcome`, `LegalBasisPack`, disclaimer, PII, country-rule metadata,
  provenance, and fail-closed contracts where possible.
- Consume Green Card/country-rule readiness structurally when useful, without creating direct CRM,
  claim, handoff, persistence, UI, or outbox side effects.
- Add focused tests for supported, unsupported, missing, stale, conflicting, low-confidence,
  metadata-incomplete, out-of-scope, and human-review-required legal-basis inputs.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.
- Update repo-canonical program/tracker proof for the implementation closeout.

The slice may add a narrow legal-basis rule-family model, but it must not migrate or redesign
`domain-country-guidance`. If country-guidance is needed, it must remain a read-only structural
source until a later gate authorizes a schema or data-maintenance change.

## Legal Basis Pre-check Contract

`P39-ASSIST-04` must treat legal basis as a member-zone pre-check, not as free-zone advice and not
as Professional Recovery representation.

The contract must be able to represent at least:

- jurisdiction or incident country;
- incident category or scenario;
- member/counterparty role where known;
- requested legal-basis rule family;
- country-rule metadata and confidence;
- optional Green Card readiness reference or summary;
- evidence references as summaries or IDs, not raw legal/medical narratives;
- disclaimer and human-review requirements.

The output must remain a typed pack or readiness result and must include:

- outcome kind from the existing `AssistanceOutcomeKind` taxonomy;
- legal-basis codes or reason codes;
- country-rule metadata used;
- required disclaimers, including `not_legal_advice`, `not_insurer_assessment`, and
  `professional_review_required` when applicable;
- PII classification;
- provenance;
- human-review requirement.

## Fail-Closed Rules

Legal-basis pre-checks must fail closed when:

- the jurisdiction or legal-basis rule is missing;
- required country-rule metadata is missing or incomplete;
- the rule is stale;
- the rule is internally conflicting or contradicted by another applicable jurisdiction;
- the country, scenario, role, or requested rule family is unsupported;
- confidence is below `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80`;
- the input would require legal interpretation beyond the encoded rule;
- the output could activate Professional Recovery or representation.

Fail-closed outputs must resolve to `manual_review_required`, `uncertain`, `unsupported_country`,
`out_of_scope`, `requires_member_zone`, or `requires_professional_recovery` as appropriate. They
must not resolve to final legal advice or automatic recovery eligibility.

## Service Boundary

Free-zone Help Now remains limited to orientation, checklist, evidence preservation, and next-step
guidance. Legal-basis pre-check is not authorized as a personalized free-zone output by this gate.

Member-zone legal-basis pre-check may return educational, rules-first guidance with mandatory
disclaimers and human-review flags. It may summarize why a legal-basis pack requires review, but it
must not decide claim acceptance, insurer liability, invalidity coefficient, settlement value,
representation, or success-fee collection.

Professional Recovery Mode remains reserved for later slices and requires membership, explicit
authorization, signed service agreement, consent, professional review, and finance/audit trail before
active representation.

## Human Review, AI, And PII Boundaries

Human review is mandatory for:

- disputed legal-basis outputs;
- unsupported, stale, missing, conflicting, uncertain, low-confidence, or metadata-incomplete rules;
- cross-jurisdiction legal-basis conflicts;
- outputs that may affect recovery eligibility, insurer negotiation posture, settlement, or
  Professional Recovery activation;
- any case where encoded rules cannot distinguish education from legal advice.

AI is not in scope for `P39-ASSIST-04`. Existing or future AI-assisted extraction/classification may
prepare inputs only when provenance is supplied, but AI must not decide legal basis, eligibility,
claim creation, handoff creation, recovery activation, agreement sufficiency, POA sufficiency, or
finance/audit outcomes.

No new PII storage path is authorized. Legal-basis tests and helpers should use summaries, codes, and
references, not raw incident narratives, medical facts, legal theories, financial terms, or
professional-secret data. Logging must remain aggregate-only.

## Non-Goals

This gate does not authorize:

- product runtime UI or `/member/incident-guide` redesign;
- changes to `apps/web/src/proxy.ts`;
- canonical route changes for `/member`, `/agent`, `/staff`, or `/admin`;
- auth, tenancy, routing, or broad domain architecture refactors;
- database migrations, RLS changes, or retention/consent persistence;
- CRM, claim, support-handoff, outbox, event, notification, agreement, POA, billing, or recovery
  record creation;
- direct `domain-crm` imports from `domain-assistance`;
- autonomous AI decisioning or new AI workflows;
- Professional Recovery activation, representation, settlement, expert-cost, success-fee, or
  finance-ledger work;
- Stripe;
- README, AGENTS.md, or broad architecture-doc edits.

## Acceptance Criteria For P39-ASSIST-04

- Legal-basis pre-check contracts are public, typed, and covered by focused unit tests.
- The implementation preserves `domain-assistance` as pure rules-first domain code.
- Outputs are member-zone pre-checks and include required disclaimers.
- Supported outputs include required country-rule metadata, provenance, PII classification, and
  human-review state.
- Missing, stale, conflicting, unsupported, low-confidence, metadata-incomplete, and out-of-scope
  inputs fail closed.
- `MINIMUM_COUNTRY_RULE_CONFIDENCE` remains the launch floor and is not lowered.
- AI is not introduced and cannot be a final decision-maker.
- The implementation does not introduce runtime UI, DB migrations, CRM/claim/handoff creation,
  outbox/event emission, proxy edits, canonical route edits, auth/tenancy/routing refactors, or
  Professional Recovery activation.
- If `domain-country-guidance` is touched, changes are limited to read-only adapter tests and require
  explicit justification.
- The implementation PR includes independent reviewer proof for legal-liability boundary, PII/logging
  discipline, country-rule fail-closed behavior, and package coupling.

## Implementation Review Plan

When `P39-ASSIST-04` starts, the main agent remains on the critical path and owns final integration.
Because this is an implementation slice with legal-liability and sensitive-data implications, the PR
must include independent sidecar review proof for:

- security, auth, tenancy, PII, and logging boundaries;
- legal-liability and human-review boundary preservation;
- maintainability and domain-model clarity;
- test, plan, and gate coverage.

Subagents are the preferred review mechanism when available. If runtime tooling blocks subagents, the
PR must record the blocker and include the strongest available local fallback review.

## Risks And Open Questions

- Legal-basis codes may look like legal advice if future UI copy is not disciplined.
- Insurer counterparties may challenge platform-derived legal-basis wording; outputs must preserve
  pre-check and human-review framing.
- Country-rule source freshness and jurisdiction ownership need operational maintenance before broad
  runtime exposure.
- Cross-jurisdiction cases may produce conflicting legal-basis signals; the domain must fail closed
  rather than infer priority.
- PII and professional-secrecy exposure increases once legal-basis inputs are attached to member
  sessions; persistence and retention remain later slices.
- Procedure, injury, vehicle-damage, invalidity, and recovery-eligibility slices must consume this
  boundary rather than bypass it.

## Approval Bar

Approve this gate only if reviewers agree that:

- `P39-ASSIST-03` is closed with PR, merge, and Notion proof recorded;
- only `P39-ASSIST-04` is promoted;
- legal-basis output remains a member-zone pre-check, not free-zone advice or final legal advice;
- country-rule metadata and the `0.80` confidence floor remain mandatory;
- missing, stale, conflicting, unsupported, low-confidence, metadata-incomplete, and out-of-scope
  inputs fail closed;
- human review remains mandatory for disputed, uncertain, or high-stakes legal-basis outputs;
- `domain-assistance` remains pure and does not import `domain-crm`;
- AI is not introduced and is not a final decision-maker;
- proxy, canonical routes, auth, tenancy, routing, DB migrations, CRM/claim/handoff creation, Stripe,
  README, AGENTS.md, and broad architecture docs remain untouched.

## Promotion / Sign-off

| Item                                               | Status    | Notes                                                                                                                                     |
| -------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `P39-ASSIST-03 Green Card / Country Rules Adapter` | completed | PR `#810`, merge commit `fdef78f32f10f87a9067fd2346e76784eea45222`, Notion sync `https://www.notion.so/364036cff1f8815ba34ff05cc94d3845`. |
| `P39-DG03 Legal Basis Pre-check Design Gate`       | complete  | Closes ASSIST-03 and promotes exactly one next implementation slice.                                                                      |
| `P39-ASSIST-04 Legal Basis Pre-check`              | promoted  | Bounded implementation slice for member-zone, rules-first legal-basis pre-check contracts.                                                |
| `P39-ASSIST-05` through `P39-ASSIST-17`            | reserved  | No implementation authority from this gate.                                                                                               |

## Verification For This Gate

Docs-only gate verification:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm track:audit`;
- `pnpm plan:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `interdomestik_qa.scope_audit`;
- `interdomestik_qa.security_guard`;
- `pnpm ci:local:quick`.

Expected implementation-PR verification for `P39-ASSIST-04`:

- `pnpm --filter @interdomestik/domain-assistance type-check`;
- `pnpm --filter @interdomestik/domain-assistance test:unit`;
- `pnpm test:unit:domains`;
- direct scans for forbidden `domain-crm`, database, proxy, route, outbox, claim, handoff, Stripe,
  and OpenAI coupling;
- `git diff --check`;
- `pnpm plan:status`;
- `pnpm track:audit`;
- `pnpm plan:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `interdomestik_qa.scope_audit`;
- `interdomestik_qa.security_guard`;
- `pnpm ci:local:quick`.
