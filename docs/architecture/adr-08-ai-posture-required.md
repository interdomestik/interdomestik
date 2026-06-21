---
status: accepted
date: 2026-06-21
owner: platform + architecture + qa
tracker: T-406
---

# ADR-08: AI Posture Required

## Status

Accepted.

## Context

The AI posture chain landed before this ADR:

- `T-403` introduced the `AICallContext` contract foundation.
- `T-404a` added durable explicit `ai_document_extraction` consent evidence for
  queued claim document AI runs.
- `T-404` made `AICallContext` mandatory at public `domain-ai` entry points and
  added missing/null/invalid rejection before provider behavior.
- `T-403b` made `AICallContext` trust-minted by `domain-privacy`, with
  identity-backed runtime validation and compile-fail proof for external
  structural forging.
- `T-405` audited current callers so they use explicit trusted brand-minted
  context or trusted consent-backed resolution, with negative proof for
  omitted, nullable, default, tenant-only, host-only, session-only,
  upload-custody, provider-default, generic Terms/Privacy, and structural-copy
  contexts.

## Decision

Every AI call requires an explicit trusted `AICallContext`. The context is a
deterministic posture and consent proof object minted only by trusted privacy
code after validating workflow, owner, tenant, actor, subject, scope, purpose,
processing purpose, retention, posture, consent, and invalidity posture.

`domain-ai` must reject missing, null, malformed, untrusted, or structurally
copied context before model/provider behavior. Callers must not fabricate,
default, infer, or silently downgrade context from ambient tenant, host,
session, upload custody, generic Terms/Privacy, provider defaults, or workflow
strings.

Queued AI work must resolve or re-mint context from durable trusted evidence at
processing time. Consent-backed document extraction remains tied to the explicit
`ai_document_extraction` consent boundary.

## Consequences

Positive:

- AI execution has an auditable deterministic posture boundary before provider
  calls.
- Consent and retention constraints are enforced by trusted server code instead
  of caller convention.
- Current callers cannot bypass the boundary by omitting context or copying a
  structurally similar object.

Negative:

- New AI call sites must obtain trusted context explicitly before calling
  `domain-ai`.

## Boundaries

This ADR records architecture only. It does not add prompts, provider calls,
model configuration, outbox AI events, Operational Brain runtime, product UI,
schema, RLS, proxy/routing/auth/session/tenancy changes, tests, README, or
AGENTS.

## Related Work

- `packages/domain-privacy/src/ai.ts`
- `packages/domain-ai/src/context.ts`
- `packages/domain-ai/src/client.ts`
- `packages/domain-claims/src/claims/claim-ai-context.ts`
- `docs/plans/2026-06-21-obr-dg18-t405-ai-caller-posture-cleanup-promotion.md`
