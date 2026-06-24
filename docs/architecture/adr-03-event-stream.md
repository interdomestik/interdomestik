---
status: accepted
date: 2026-06-24
owner: platform + architecture + qa
tracker: T-107
---

# ADR-03: Domain Event Stream

## Status

Accepted.

## Context

Interdomestik needs one durable event spine for audit projection, member
timeline rendering, replay, future reporting projections, and cross-domain
coordination. Earlier ad hoc audit writes and direct read-model updates made
ordering, rollback, redaction, and replay behavior difficult to verify.

The completed M1 evidence established the foundation:

- `T-104` added the `domain_events` transactional outbox and typed
  `appendEvent(tx, ...)` helper.
- `T-002`/`T-002c` append `claim.status_changed@1` in the same transaction as
  status, lifecycle, and history writes, with rollback proof.
- `T-104b` added tenant-scoped delivery records, replay, locking, and idempotent
  delivery marking.
- `T-104c` made event payloads fail closed through explicit allowlists.
- `T-105b` activated the bounded audit projection consumer for
  `claim.status_changed@1`.
- `T-104d` through `T-104h` added erasure-key, encrypted PII reference, bounded
  key-cache, and erased-subject render foundations.
- `T-206` consumes public timeline facts from `domain_events` with only allowed
  public enrichment.

## Decision

`domain_events` is the canonical durable domain-event stream. Domain facts that
need replay, projection, audit, or timeline semantics must be appended to that
stream inside the same transaction as the authoritative domain write whenever
the fact is part of the write contract.

Events are tenant scoped and versioned. Payloads must use an explicit allowlist
per event name/version and must store only the durable non-PII fact needed for
replay. Sensitive values belong in approved reference stores with erasure-key
handling, not in raw event payloads.

Consumers use delivery records and idempotency keys rather than maintaining
parallel one-off audit or timeline write paths. Projections may replay from the
event stream, but they must preserve tenant isolation and fail without exposing
raw payload, actor internals, or PII.

The current accepted runtime event family is bounded. `claim.status_changed@1`
and its audit/timeline proof are accepted; broader event families, billing
consumers, CQRS projections, and product timeline expansion require separately
promoted slices.

## Consequences

Positive:

- Domain writes, event facts, audit projection, and timeline rendering can be
  reasoned about from one ordered stream.
- Replay and delivery idempotency have durable, tenant-scoped records.
- PII erasure can preserve event skeletons while rendering sensitive references
  unavailable.

Negative:

- New event families require allowlist, versioning, projection, redaction, and
  replay proof before production use.
- Callers cannot bypass the outbox with convenient direct audit or read-model
  writes when a durable domain fact is required.

## Boundaries

This ADR records accepted architecture only. It does not add event families,
runtime writers, consumers, queue workers, schema, RLS, migrations, billing
logic, product UI, routes, auth/session behavior, proxy changes, README, or
AGENTS updates.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/architecture/adr-02-case-recovery-split.md`
- `packages/domain-claims/src/claims/transition-domain-events.ts`
- `packages/database/src/schema/domain-events.ts`
- `packages/database/src/domain-events/append-event.ts`
- `packages/database/src/domain-events/deliveries.ts`
