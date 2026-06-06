---
plan_role: input
status: active
source_of_truth: false
owner: membership-billing
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM07 Paddle Billing Webhooks Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to Paddle billing webhook
> receipt, entity routing, and billing/audit persistence only. It does not change runtime behavior
> or claim full enterprise threat-model completion.

## Identity

- Surface: Paddle billing webhooks for shared and entity-scoped receipt paths.
- Owner: membership billing ingestion and audit.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/webhooks/paddle/route.ts`,
  `apps/web/src/app/api/webhooks/paddle/_core.ts`,
  `apps/web/src/app/api/webhooks/paddle/[entity]/route.ts`,
  `apps/web/src/app/api/webhooks/paddle/[entity]/_core.ts`,
  `packages/domain-membership-billing/src/paddle-webhooks/*`,
  `packages/domain-membership-billing/src/paddle-server.ts`.
- Proof files: `apps/web/src/app/api/webhooks/paddle/route.test.ts`,
  `apps/web/src/app/api/webhooks/paddle/_core.test.ts`,
  `apps/web/src/app/api/webhooks/paddle/[entity]/route.test.ts`,
  `apps/web/src/app/api/webhooks/paddle/[entity]/_core.test.ts`,
  `packages/domain-membership-billing/src/paddle-webhooks/*.test.ts`,
  `packages/domain-membership-billing/src/paddle-server.test.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: Paddle event ids, event types, provider transaction ids, subscription references,
  customer identifiers and email values present in payloads, custom data user/tenant/lead ids,
  billing entity, tenant id, invoice totals, currency, payload hashes, and processing errors.
- Durable records: `webhook_events`, `billing_invoices`, `billing_ledger_entries`, subscriptions,
  users used for fallback tenant resolution, and lead records touched by successful transaction
  conversion.
- Storage objects or external systems: Paddle webhook delivery, Paddle SDK signature validation,
  Sentry exception capture, payment-failure email, thank-you letter sending, and password-reset
  onboarding email.
- Audit or provenance records: webhook receipt, duplicate, invalid-signature, processed, failed,
  invoice posted, and replay-ignored audit events.
- Explicit non-data: this record does not include production webhook secrets, API keys, raw payment
  card data, Paddle customer payload samples, raw PII examples, or provider dashboard details.

## Actors And Trust Boundaries

- Trusted actors: Paddle webhook delivery after cryptographic signature validation, entity-scoped
  server configuration, and server-side billing/domain handlers.
- Untrusted actors: unsigned callers, callers with invalid signatures, replayed events, malformed
  JSON bodies, forged entity path segments, payloads whose tenant/entity metadata disagrees with
  the route, and compromised provider custom data.
- External systems: browserless HTTP webhook callers, Paddle SDK verification, Next.js route
  handlers, PostgreSQL persistence, Sentry, email delivery, and auth password-reset onboarding.
- Trust boundaries: public internet to webhook route, route to Paddle signature verification, entity
  path segment to billing-entity config, verified payload to tenant/entity resolution, webhook core
  to billing persistence, and billing persistence to outbound side effects.
- Tenant isolation boundary: entity routes reject unknown path segments and preflight verified
  payloads for entity mismatch; shared core resolves tenant primarily from canonical subscription
  references, falls back to provider user custom data only when subscription lookup has no tenant,
  scopes dedupe by entity or tenant, and invoice/ledger invariants require tenant/entity agreement.

## Existing Controls

- Authentication and authorization controls: webhooks are unauthenticated by design, but shared and
  entity cores require Paddle signature verification before processing accepted events; signature
  bypass is allowed only in `NODE_ENV=test`.
- Tenant-scoping controls: entity-specific routes use entity-specific Paddle config and secrets,
  reject unknown entity segments, verify explicit or resolved tenant/entity mismatches before shared
  handling, and persist billing invariants only when tenant id maps to the expected billing entity.
- Input validation and rate limits: routes rate limit before body reads; missing signature or secret
  returns `400`; invalid signature returns `401`; malformed JSON remains an empty parsed payload
  that still must pass signature verification; transaction invoice invariants require transaction
  id, amount, and currency.
- Storage or persistence controls: webhook receipts use scope-aware dedupe keys, provider/scope
  event uniqueness, provider/scope transaction uniqueness, invalid-signature best-effort
  persistence, duplicate no-op handling, processed/failed markers, and append-only ledger
  uniqueness for invoice postings.
- Audit, telemetry, or evidence controls: Sentry captures unexpected route failures; audit events
  record invalid signatures, receipt, duplicates, processed/failed results, invoice posting, and
  replay-ignore decisions without recording secrets.
- Current proof files: route, core, persistence, invariant, entity config, handler, schema, and
  ownership-map files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                                | Existing control                                                                | Residual risk                                                          | Follow-up or owner                 |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Spoofing               | Attacker submits a fake Paddle event.                                 | Signature verification gates accepted processing; invalid attempts are logged.  | Compromised webhook secret would make forged events indistinguishable. | Secret-rotation incident lane.     |
| Tampering              | Payload tenant/entity metadata routes money to the wrong entity.      | Entity preflight, canonical subscription lookup, and invoice invariant checks.  | Fallback user custom data remains weaker than canonical subscriptions. | Billing/platform owner accepted.   |
| Repudiation            | Provider or attacker denies delivery, replay, or failure state.       | Durable receipt rows and audit events record dedupe, processed, failed states.  | Provider dashboard reconciliation proof is outside this record.        | Billing reconciliation lane.       |
| Information disclosure | Webhook payload stores customer identifiers or email values.          | Payload is server-side only; this doc avoids raw samples and secrets.           | Retention/redaction cadence for webhook payload JSON is not proven.    | Data lifecycle verification lane.  |
| Denial of service      | High-rate webhook calls pressure body parsing and DB writes.          | Rate limit runs before body read; duplicate replays short-circuit handlers.     | Alert routing for webhook pressure is only partially exercised.        | Alert-routing/performance lanes.   |
| Elevation of privilege | Webhook side effects create billing or onboarding state cross-tenant. | Tenant/entity agreement gates invoice/ledger writes and lead conversion checks. | Outbound email side effects depend on handler-level tenant resolution. | Membership-billing owner accepted. |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, core, domain, schema, and test files listed
  in the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to Paddle webhook receipt and
  persistence, accurately describes entity-scoped signature/config handling, and avoids claiming
  provider-dashboard reconciliation, live secret rotation, or payment-card controls.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register only.

## Result

- Decision: pass for the Paddle billing webhook threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: webhook secret rotation drills, provider dashboard reconciliation proof,
  webhook payload retention/redaction cadence, alert-routing exercise proof, and outbound side-effect
  delivery observability remain outside this record.
- Accepted residual risks: webhook payloads necessarily contain provider billing metadata, and
  fallback tenant resolution from provider user custom data remains a secondary path after
  canonical subscription lookup cannot resolve a tenant.
- Follow-up slice: `ENT-TM08 Assisted Registration Threat Model`.
- Owner sign-off: platform/membership-billing review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the Paddle billing webhook surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for assisted registration, admin
verification, and other promoted sensitive surfaces.
