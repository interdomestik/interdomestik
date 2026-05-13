---
status: design-review
date: 2026-05-13
slice: P36-DG08
title: Post-DM07 Closeout And AI Production Readiness Selection
owner: platform + product + security + qa
phase: Phase C
---

# P36-DG08 Post-DM07 Closeout And AI Production Readiness Selection

## Decision

`P36-CRM-DM07 CRM Lead Activity Timeline Read-Side Domain Port` is closed after PR `#737`,
merge commit `c2d904b8a5b8cf71fe15757cadbb7dc430ca8154`.

P36 is closed. The CRM data-model/read-side hardening tranche has completed the final promoted
lead-detail activity-feed read-side port and no longer needs to keep a stale active DM07 state in
the live program or tracker.

The next bounded slice is:

`P37-AI-DG01 AI Production Readiness Gate And Eval Contract`

This is a design-gate slice, not runtime AI implementation. It is promoted because P36 explicitly
kept AI work out of scope until the CRM lead-detail and activity reads moved behind the domain
boundary, and that prerequisite is now complete. The next smallest useful production step is to
define the AI contract for this codebase before any new model calls, prompt rewrites, agentic flows,
or AI-facing product behavior are added.

## Inputs

| Input                              | Relevance                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#737` / `P36-CRM-DM07`         | Merged the existing agent lead-detail activity-feed read behind `domain-crm/lead-activities` with tenant, agent, and branch scope enforcement.       |
| Remote merge evidence              | DM07 is on `main` through merge commit `c2d904b8a5b8cf71fe15757cadbb7dc430ca8154`; CI, Copilot threads, and Sonar issues were green before merge.    |
| P36 CRM read-side sequence         | DM05, DM06, and DM07 moved dashboard, lead-detail, and lead-activity reads through `domain-crm` boundaries after the CRM data model was hardened.    |
| Current AI production skill update | The local `interdomestik-slice-runner` now requires AI slices to classify data boundaries, model contracts, evals, guardrails, observability, costs. |
| Phase C rules                      | Proxy, canonical routes, auth/tenancy architecture, Stripe, README, AGENTS, broad architecture docs, and broad product redesign remain out of scope. |

## Promoted Slice

`P37-AI-DG01 AI Production Readiness Gate And Eval Contract`

Design-gate scope:

- Inventory current AI-facing surfaces, including any existing model-call, prompt, summarization,
  extraction, classification, assistant, agent, RAG, automation, or AI-assisted review paths.
- Classify data boundaries for each surface: tenant scope, user/role scope, PII exposure, retention,
  logging, redaction, and whether the surface can consume or emit customer-visible facts.
- Define the repo contract for model identity, prompt ownership, prompt versioning, tool/function
  schemas, structured-output schemas, refusal/error behavior, and deterministic fallback behavior.
- Define minimum eval coverage before implementation: golden fixtures, adversarial/abuse fixtures,
  tenant-isolation fixtures, PII leakage checks, schema-conformance checks, and regression thresholds.
- Define guardrail placement across input validation, retrieval/tool authorization, model output
  validation, human-review requirements, audit logs, and user-visible uncertainty handling.
- Define observability requirements: trace IDs, tenant-safe event fields, prompt/model/schema version
  tags, latency/cost counters, failure taxonomy, and alertable degradation metrics.
- Define release gates for AI slices, including focused tests, security guard coverage, eval command
  names, PR evidence, and post-merge monitoring expectations.
- Promote at most one bounded implementation slice only after acceptance criteria are measurable.

Allowed touch points for P37-AI-DG01:

- `docs/plans/**` for program/tracker state and the design-gate plan.
- Focused repo evidence docs under an existing docs area only if the current planning pattern requires
  a durable inventory artifact.
- Guard/eval command references only as design requirements; no guard implementation in this gate.

Must not touch in P37-AI-DG01:

- Runtime AI behavior, model calls, prompts, schemas, tools, retrieval, automations, or agent flows.
- `apps/web/src/proxy.ts`.
- Canonical routes `/member`, `/agent`, `/staff`, or `/admin`.
- Auth provider layering, session shape, or tenancy architecture.
- Stripe.
- README, AGENTS, or broad architecture docs.
- Broad UX redesign, pipeline UI, task aggregate work, campaigns, cron/NPS architecture,
  `member_leads` unification, dashboard analytics expansion, or broad DB posture burn-down.

## Acceptance Criteria For P37-AI-DG01

- P36 and DM07 are marked complete in the live program and tracker with PR `#737` and merge commit
  `c2d904b8a5b8cf71fe15757cadbb7dc430ca8154`.
- P37 is opened as the next active tranche, bounded to AI production readiness.
- The gate defines the required AI surface inventory and data-boundary classifications.
- The gate defines model/prompt/schema ownership and versioning requirements.
- The gate defines eval, golden fixture, adversarial fixture, guardrail, observability, cost, latency,
  reliability, release, and post-merge monitoring requirements.
- Exactly one next bounded slice is promoted, and it is the design gate itself until the contract is
  complete.
- No runtime product behavior, proxy, route, auth, tenancy, Stripe, README, AGENTS, broad
  architecture-doc, or AI implementation files change.

## Verification Plan

- `git diff --check`.
- `pnpm plan:status`.
- `pnpm plan:audit`.
- `pnpm track:audit`.
- `pnpm docs:verify`.
- `pnpm verify-slice -- --static`.
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No runtime AI implementation.
- No new model call, prompt rewrite, tool schema, RAG, assistant, or agent behavior.
- No product UI redesign.
- No task aggregate, automation, campaign, cron/NPS, or `member_leads` unification.
- No broad CRM continuation.
- No broad DB baseline burn-down.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc
  changes.
