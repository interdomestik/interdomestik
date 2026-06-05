---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# ENT-SCA03 Deploy Digest Verification Boundary

> Status: Input document. This record documents the repo-owned deploy-boundary proof added after
> `ENT-SCA02`. It does not claim full enterprise readiness or replace the active program/tracker
> authority.

## Scope

This slice implements the next repo-owned supply-chain proof from
`docs/plans/enterprise-readiness-register.md`.

Changed surfaces:

- `.github/workflows/cd.yml`
- `.github/actions/trigger-digest-verified-deploy/action.yml`
- `scripts/ci/cd-deploy-digest-boundary.test.mjs`
- `scripts/ci/workflow-contracts.test.mjs`
- `docs/plans/enterprise-readiness-register.md`

Out of scope:

- Runtime code, schema, auth, tenancy, routing, billing, product UI, proxy, README, AGENTS, and
  broad architecture docs.
- Production operations, credential changes, registry administration, or provider-side deploy
  webhook implementation.
- Simulated digest equality or mutable tag-only deployment proof.

## Implemented Proof

The staging and production CD deploy jobs now:

- carry the immutable image digest from the corresponding build job as `EXPECTED_IMAGE_DIGEST`;
- include `image_digest` in the environment-scoped deploy webhook payload;
- fail closed when the build job does not produce an image digest;
- require the deploy webhook to return a JSON body with `image_digest`; and
- compare the webhook-confirmed digest to the attested build digest before deploy sign-off.

The contract tests fail if either deploy job drops digest propagation, stops sending
`image_digest`, or stops comparing the webhook-confirmed digest with the build output digest.

## Current Enterprise Gap

This slice closes the repo-owned CD/deploy boundary for immutable digest handoff, but provider-side
runtime proof still depends on the external deploy webhook or platform reporting the real running
image digest. If the webhook cannot yet return the digest it deployed, the CD workflow now records
that as a hard failure instead of treating tag or commit equality as sufficient.

## Result

- Decision: deploy-boundary digest confirmation configured.
- Residual risk: external deploy webhook/platform support must return the deployed digest in real
  CD runs; otherwise production sign-off fails closed.
- Follow-up lane: first real CD run should attach the webhook-confirmed digest evidence to the
  release record; broader enterprise work still includes restore drills, threat modeling, alert
  routing, data lifecycle verification, and performance gates.
