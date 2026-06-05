---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# ENT-SCA02 Supply Chain Attestation CI Proof

> Status: Input document. This record documents the repo-owned CD proof added for
> supply-chain attestation. It does not claim full enterprise readiness or replace
> the active program/tracker authority.

## Scope

This slice implements the next repo-owned proof from
`docs/plans/ent-sca01-supply-chain-attestation-evidence-contract.md`.

Changed surfaces:

- `.github/workflows/cd.yml`
- `.github/actions/build-attested-image/action.yml`
- `scripts/ci/cd-attestation-contract.test.mjs`
- `scripts/ci/workflow-contracts.test.mjs`
- `docs/plans/enterprise-readiness-register.md`

Out of scope:

- Runtime code, schema, auth, tenancy, routing, billing, product UI, proxy, README, AGENTS, and
  broad architecture docs.
- Production operations, credential changes, registry administration, or deploy-webhook changes.

## Implemented Proof

The staging and production CD build jobs now:

- request GitHub OIDC and artifact-attestation permissions with `id-token: write` and
  `attestations: write`;
- build GHCR images with Docker Buildx `provenance: mode=max` and `sbom: true`;
- generate an SPDX JSON image SBOM with Syft through pinned `anchore/sbom-action@v0.24.0`;
- capture the immutable image digest through `steps.build.outputs.digest`;
- publish the digest as a job output named `image_digest`;
- create signed build-provenance and SBOM attestations with pinned `actions/attest@v4`;
- push both attestations to the registry; and
- run `gh attestation verify oci://... -R ...` for provenance and the SPDX SBOM predicate before
  any deploy job can proceed, enforcing the current commit SHA, ref, and CD signer workflow.

The new workflow contract test fails if either build job drops digest capture, SBOM/provenance
generation, signed provenance or SBOM attestation, or attestation verification.

## Current Enterprise Gap

This slice improves artifact custody before deploy promotion, but it does not yet prove deployed
digest equality. The current deploy webhook payload and `/api/health` contract prove the deployed
commit SHA, not the running OCI image digest.

The remaining blocker is therefore explicit:

- Provider/deploy boundary must accept or expose the immutable image digest used for deployment.
- The app or deploy platform must expose a safe non-secret runtime digest proof.
- CD must compare that deployed digest to the attested digest before final production sign-off.

## Result

- Decision: repo-owned CI/CD attestation proof implemented.
- Residual risk: deployed digest equality is still pending a deploy-boundary contract.
- Follow-up slice: `ENT-SCA03 Deploy Digest Verification Boundary`.
