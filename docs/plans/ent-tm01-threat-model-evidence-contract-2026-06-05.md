---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# ENT-TM01 Threat Model Evidence Contract

> Status: Input document. This contract scopes the enterprise threat-model evidence lane. It does
> not claim that Interdomestik has completed a full per-surface threat model, and it does not
> replace the active program or tracker authority.

## Scope

This contract covers sensitive application surfaces already identified by
`docs/reviews/2026-04-25-sensitive-route-ownership-map.md` and the enterprise gap called out in
`docs/reviews/2026-04-25-production-professionalism-rereview.md`.

In scope:

- Assisted registration; initial claim-wizard uploads; authenticated claim evidence uploads.
- Document signed URLs and downloads; share packs; AI run read and review.
- Paddle billing webhooks; admin verification details.
- Notification and push settings only when a future slice changes delivery trust boundaries.

Out of scope:

- Runtime code, schema, auth, tenancy, routing, billing, product UI, proxy, README, AGENTS, or broad
  architecture-document changes.
- Production credential changes, data restores, provider configuration changes, or incident drills.
- Raw PII, claim narratives, uploaded document contents, payment data, private keys, or production
  secrets in any model record.
- Replacing the route ownership map. A threat-model record may cite that map, but ownership and
  entrypoint updates remain there.

## Required Per-Surface Record

Every future threat-model record must cover exactly one bounded surface unless the register
explicitly promotes a grouped slice.

Use this minimum structure:

```md
# ENT-TMxx <Surface> Threat Model - YYYY-MM-DD

## Identity

- Surface:
- Owner:
- Reviewers:
- Related routes, jobs, or domain modules:
- Related tests or gates:
- Last reviewed:

## Data And Assets

- Protected data:
- Durable records:
- Storage objects or external systems:
- Audit or provenance records:
- Explicit non-data:

## Actors And Trust Boundaries

- Trusted actors:
- Untrusted actors:
- External systems:
- Trust boundaries:
- Tenant isolation boundary:

## Existing Controls

- Authentication and authorization controls:
- Tenant-scoping controls:
- Input validation and rate limits:
- Storage or persistence controls:
- Audit, telemetry, or evidence controls:
- Current proof files:

## STRIDE Threat Table

| Category               | Threat | Existing control | Residual risk | Required follow-up or acceptance owner |
| ---------------------- | ------ | ---------------- | ------------- | -------------------------------------- |
| Spoofing               |        |                  |               |                                        |
| Tampering              |        |                  |               |                                        |
| Repudiation            |        |                  |               |                                        |
| Information disclosure |        |                  |               |                                        |
| Denial of service      |        |                  |               |                                        |
| Elevation of privilege |        |                  |               |                                        |

## Verification

- Required local proof:
- Required CI proof:
- Required reviewer or security disposition:
- Explicitly skipped proof and reason:

## Result

- Decision: pass/fail/deferred
- Blocking gaps:
- Non-blocking gaps:
- Accepted residual risks:
- Follow-up slice or issue:
- Owner sign-off:
```

## Acceptance Criteria

A per-surface threat-model record satisfies this contract only when:

- it identifies the protected data, durable records, external systems, and tenant boundary for the
  selected surface;
- it includes at least one concrete threat and disposition for each STRIDE category, even when the
  disposition is "not applicable" with rationale;
- every residual high-impact tenant isolation, privilege, data exposure, or payment integrity risk
  has a named follow-up slice, issue, or acceptance owner;
- current controls are linked to repo evidence such as tests, gates, ownership maps, plans, or
  implementation files without copying sensitive data;
- it records verification that matches the touched surface and does not use docs-only checks to
  claim runtime enforcement; and
- it contains no secrets, credentials, raw PII, claim narratives, document contents, payment data,
  or production-only operational details.

## Recommended First Surface Slice

The first bounded follow-up should be `ENT-TM02 Initial Claim Uploads Threat Model`.

Scope:

- Model initial claim-wizard uploads as one sensitive data-ingress surface.
- Cover MIME and size validation, tenant and claim access checks, signed upload URL generation,
  upload-intent creation, storage path safety, and post-upload metadata confirmation.
- Cite existing proof from the ownership map and focused upload tests.
- Record residual risks without changing runtime code.

Rationale: uploads cross browser, storage, tenant, file-content, and evidence-custody boundaries,
but the initial upload surface is smaller than the full document custody lane and already has clear
route/core ownership plus test evidence.

## Relationship To Enterprise Readiness

This contract supports the open threat-model lane in
`docs/plans/enterprise-readiness-register.md`. It changes the lane status from unscoped to scoped
with a first per-surface model pending. It does not by itself prove full enterprise readiness.
