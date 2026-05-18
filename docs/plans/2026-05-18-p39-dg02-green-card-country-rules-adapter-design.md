# P39-DG02 Green Card Country Rules Adapter Design Gate

Status: complete
Slice: `P39-DG02`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-18
Authority: repo-canonical closeout and promotion gate. This document closes the post-`P39-ASSIST-02`
audit gap and promotes exactly one next implementation slice: `P39-ASSIST-03 Green Card / Country
Rules Adapter`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design gate,
and `deferred` records an explicitly postponed candidate. Tracker queue statuses remain the
repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Predecessor Dependency

`P39-ASSIST-02 Help Now / Incident Scene Pack` is the direct predecessor for this gate.

Predecessor proof:

- `P39-ASSIST-02` landed through PR `#808`, merge commit
  `dd423a03cc8ad157ea974b930810742514732e5c`.
- Closeout sync proof is recorded in Notion at
  `https://www.notion.so/364036cff1f8816dbbdee924c9dc0966`.
- `P39-ASSIST-01 domain-assistance Core Package` landed through PR `#807`, merge commit
  `6e6e52dd87815b4be1177cc06a4d82ef1a1abaa0`.
- `P39-ASSIST-00 Program Spec And Domain Contracts` remains the governing contract for country-rule
  confidence, disclaimer, PII, human-review, AI, and Professional Recovery boundaries.

`P39-ASSIST-02` is closed as a Help Now / Incident Scene Pack slice. It does not reopen P38, does
not authorize broad Help Now UI expansion, and does not move CRM, claim, handoff, Professional
Recovery, or recovery-finance integration work into active scope.

## Source Inputs

- Program gate: `docs/plans/2026-05-17-p39-dg01-ida-assistance-recovery-program-design-gate.md`.
- Program contracts: `docs/plans/2026-05-17-p39-assist-00-program-spec-domain-contracts.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Pure assistance package: `packages/domain-assistance/src/types.ts`,
  `packages/domain-assistance/src/rules/country-rules.ts`,
  `packages/domain-assistance/src/rules/help-now.ts`, and
  `packages/domain-assistance/src/rules.test.ts`.
- Existing country guidance package: `packages/domain-country-guidance/src/types.ts`,
  `packages/domain-country-guidance/src/data.ts`, `packages/domain-country-guidance/src/service.ts`,
  and `packages/domain-country-guidance/src/service.test.ts`.
- Existing member incident surface remains a later runtime caller candidate:
  `apps/web/src/app/[locale]/(app)/member/incident-guide/page.tsx`.

## Candidate Ranking

| Rank | Candidate                                                      | Decision             | Rationale                                                                                                                                                                            |
| ---- | -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P39-ASSIST-03 Green Card / Country Rules Adapter`             | Promote              | Green Card is the next strategic assistance track and depends on country-rule readiness, metadata, confidence, and fail-closed semantics before any product runtime or UI expansion. |
| 2    | `P39-ASSIST-04 Legal Basis Pre-check`                          | Defer                | Legal-basis pre-checks need the country-rule adapter first so jurisdictional gaps fail closed instead of producing platform-derived legal conclusions.                               |
| 3    | Runtime Green Card UI or `/member/incident-guide` expansion    | Reject for this gate | The next slice must harden domain/country-rule contracts first. UI would widen product, auth, copy, accessibility, and disclaimer review before the adapter is proven.               |
| 4    | CRM/claim/handoff creation from assistance sessions            | Reject               | `P39-ASSIST-09` remains a later application/workflow-layer integration slice. `domain-assistance` must continue returning typed outcomes only.                                       |
| 5    | Professional Recovery activation or recovery-finance workflows | Reject               | Professional Recovery Mode requires authorization, agreement, consent, professional review, and finance/audit trail and remains reserved for later slices.                           |

## Promoted Slice

Promote exactly one implementation slice:

`P39-ASSIST-03 Green Card / Country Rules Adapter`

The slice must introduce a bounded adapter contract for Green Card country-rule readiness without
turning `domain-assistance` into a UI feature or a record-creation service. It must keep
`domain-assistance` rules-first and deterministic, and must preserve the `P39-ASSIST-00` rule that
AI is never the final decision-maker.

Authorized implementation scope:

- Add or extend pure `domain-assistance` country-rule/Green Card types and helpers.
- Add focused contract tests for supported, unsupported, missing, stale, conflicting, and
  low-confidence country-rule inputs.
- Adapt `packages/domain-country-guidance` only if a narrow typed read boundary is required for the
  Green Card adapter. Wholesale migration, replacement, or broad schema redesign is not authorized.
- Keep any `domain-country-guidance` changes limited to adapter-friendly data/types/service tests.
- Update package metadata only if needed for a narrow domain-package dependency.
- Update repo-canonical program/tracker proof and repo-size budget only for the implementation
  closeout.

The implementation should prefer structural adapter inputs over direct package coupling when that
keeps the assistance domain easier to test. If direct `domain-country-guidance` dependency is needed,
the PR must justify why the adapter cannot remain purely structural.

## Green Card Adapter Contract

`P39-ASSIST-03` must treat Green Card as its own strategic track, not as generic incident guidance.
The adapter contract must be able to represent at least:

- incident country;
- vehicle registration country when known;
- insurer or counterparty country when known;
- requested rule family or Green Card scenario;
- source rule metadata;
- confidence and freshness status;
- cross-jurisdiction conflicts.

The adapter must return typed outcomes or readiness results. It must not create CRM leads, claims,
support handoffs, persisted assistance sessions, outbox events, agreements, authorizations, or
Professional Recovery records.

## Country Rule Metadata And Fail-Closed Rules

Every country-specific rule used by this slice must carry:

- `country`;
- `sourceReference`;
- `owner`;
- `lastReviewed`;
- `confidence`.

The launch-floor threshold remains `MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.80`. `P39-ASSIST-03` may
raise the threshold by country, rule family, or Green Card scenario, but it may not lower the
threshold without a later repo-canonical gate and legal/professional review.

The adapter must fail closed when a country rule is:

- missing;
- stale;
- internally conflicting;
- unsupported for the requested Green Card scenario;
- contradicted by another applicable jurisdiction;
- below the active confidence threshold;
- present but missing required metadata.

Fail-closed outputs must resolve to `manual_review_required`, `uncertain`, `unsupported_country`, or
`out_of_scope` as appropriate. They must not produce a final legal, medical, insurance, or recovery
decision.

## Service Boundary

Free-zone Help Now remains limited to orientation, checklist, evidence preservation, and next-step
guidance. Green Card country-rule readiness may support future free-zone education only when it does
not require PII and carries the required disclaimers.

Member-zone and Professional Recovery boundaries remain unchanged:

- saved sessions, legal/procedure/injury/vehicle pre-checks, and invalidity-review requests require
  member/authenticated handling under existing tenancy boundaries;
- invalidity coefficient remains member/human-review only;
- Professional Recovery Mode requires membership, explicit authorization, signed service agreement,
  consent, professional review, and finance/audit trail before active representation.

`P39-ASSIST-03` must not activate Professional Recovery Mode.

## Human Review, AI, And PII Boundaries

Mandatory human review remains required for unsupported, stale, conflicting, uncertain, low-confidence,
or cross-jurisdiction Green Card outputs. Any output that could be read as legal, medical,
insurance, financial, or recovery advice must remain a pre-check or a human-review request.

AI is not in scope for this slice. If existing AI-assisted extraction or classification is used by a
future caller, it must carry typed provenance (`aiConfidence`, `aiModelVersion`,
`aiWorkflowName`, `aiPromptOrSchemaVersion`, optional `aiRunId`) and cannot override deterministic
country-rule fail-closed behavior.

No new PII storage path is authorized. Logging must remain aggregate-only and must not include
personal, medical, legal, insurer, financial, or professional-secret data.

## Non-Goals

This gate does not authorize:

- product runtime UI or `/member/incident-guide` redesign;
- changes to `apps/web/src/proxy.ts`;
- canonical route changes for `/member`, `/agent`, `/staff`, or `/admin`;
- auth, tenancy, routing, or broad domain architecture refactors;
- database migrations or RLS changes;
- CRM, claim, support-handoff, outbox, or event creation;
- direct `domain-crm` imports from `domain-assistance`;
- autonomous AI decisioning;
- Professional Recovery activation, agreements, POA, success-fee, expert-cost, or finance-ledger work;
- Stripe;
- README, AGENTS.md, or broad architecture-doc edits.

## Acceptance Criteria For P39-ASSIST-03

- Green Card country-rule adapter/readiness contracts are public, typed, and covered by focused unit
  tests.
- The implementation preserves `domain-assistance` as pure rules-first domain code.
- Supported-country results include required country-rule metadata and provenance.
- Missing, stale, conflicting, unsupported, low-confidence, and metadata-incomplete rules fail
  closed.
- Cross-jurisdiction contradictions fail closed and require human review.
- `MINIMUM_COUNTRY_RULE_CONFIDENCE` remains the floor and is not lowered.
- The implementation does not introduce runtime UI, DB migrations, CRM/claim/handoff creation,
  outbox/event emission, proxy edits, canonical route edits, auth/tenancy/routing refactors, or
  autonomous AI decisioning.
- If `domain-country-guidance` is touched, changes are limited to the adapter boundary and tests.
- The PR includes implementation subagent review because the user explicitly requested subagents for
  the implementation phase.

## Implementation Subagent Plan

When `P39-ASSIST-03` starts, the main agent remains on the critical path and owns final integration.
Subagents should be used for independent, non-overlapping work:

- domain-assistance contracts/tests exploration or patching;
- domain-country-guidance adapter/readiness exploration or patching if that package is touched;
- pre-PR sidecar review for security/auth/tenancy, maintainability, and test/gate coverage.

Subagents must not edit `apps/web/src/proxy.ts`, route/auth/tenancy files, README, AGENTS.md, or
broad architecture docs.

## Risks And Open Questions

- Green Card country-rule freshness and ownership need an explicit maintenance owner and review SLA
  before product runtime exposure.
- Cross-jurisdiction cases may produce conflicting country outputs; the adapter must fail closed
  rather than pick a jurisdiction implicitly.
- Existing `domain-country-guidance` data is basic and may not yet contain enough Green Card-specific
  source metadata. The slice may need placeholder unsupported/manual-review behavior until sources
  are curated.
- Insurers may challenge platform-derived eligibility wording. Output copy and future UI must remain
  framed as educational pre-checks or human-review requests.
- If a direct package dependency is added from `domain-assistance` to `domain-country-guidance`, the
  PR must prove the coupling remains a narrow adapter and not a broader domain merge.

## Approval Bar

Approve this gate only if reviewers agree that:

- `P39-ASSIST-02` is closed with PR, merge, and Notion proof recorded;
- only `P39-ASSIST-03` is promoted;
- Green Card remains a country-rule adapter/readiness slice, not a UI or runtime workflow slice;
- country-rule metadata and `0.80` confidence floor remain mandatory;
- missing, stale, conflicting, unsupported, low-confidence, and metadata-incomplete rules fail
  closed;
- `domain-assistance` remains pure and does not import `domain-crm`;
- AI is not a final decision-maker;
- proxy, canonical routes, auth, tenancy, routing, DB migrations, CRM/claim/handoff creation, Stripe,
  README, AGENTS.md, and broad architecture docs remain untouched.

## Promotion / Sign-off

| Item                                                    | Status    | Notes                                                                                                                                     |
| ------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `P39-ASSIST-02 Help Now / Incident Scene Pack`          | completed | PR `#808`, merge commit `dd423a03cc8ad157ea974b930810742514732e5c`, Notion sync `https://www.notion.so/364036cff1f8816dbbdee924c9dc0966`. |
| `P39-DG02 Green Card Country Rules Adapter Design Gate` | complete  | Closes the post-ASSIST-02 audit gap and promotes exactly one next implementation slice.                                                   |
| `P39-ASSIST-03 Green Card / Country Rules Adapter`      | promoted  | Bounded implementation slice for typed Green Card country-rule readiness and adapter contracts.                                           |
| `P39-ASSIST-04` through `P39-ASSIST-14`                 | reserved  | No implementation authority from this gate.                                                                                               |

## Verification For This Gate

Docs-only gate verification:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm track:audit`;
- `pnpm plan:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `interdomestik_qa.scope_audit`;
- `pnpm ci:local:quick`.

Expected implementation PR verification for `P39-ASSIST-03`:

- focused `@interdomestik/domain-assistance` type-check and unit tests;
- focused `@interdomestik/domain-country-guidance` tests if that package is touched;
- `pnpm test:unit:domains`;
- direct import/scope scans proving no `domain-crm`, SQL/database, proxy, route, migration,
  CRM/claim/handoff, outbox, Stripe, or AI decisioning coupling;
- `git diff --check`;
- `pnpm plan:status`;
- `pnpm track:audit`;
- `pnpm plan:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check`;
- `interdomestik_qa.scope_audit`;
- `interdomestik_qa.security_guard`;
- `pnpm ci:local:quick`;
- `pnpm pr:verify` before merge readiness.
