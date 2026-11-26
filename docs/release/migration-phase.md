# WP-15 shared release migrations

CD owns shared schema changes under R-12. A deploy-authorized push to protected `main`, manual dispatch from that branch, or push of an owner-controlled `v*` tag at reviewed `main` runs the same phase sequence. Production waits for staging verification against the full journal. The release lock covers migration statements and ledger writes in one transaction. Ledger order is insertion order, so the historical timestamp inversion is preserved.

## Owner setup

1. In repository **Settings → Environments**, create `staging-migration-expand`, `staging-migration-contract`, `production-migration-expand` and `production-migration-contract`. Allow the protected branch `main` and the `v*` release tag pattern. Verify that existing tag protection restricts creation and movement of those tags to authorized release operators. Issue tags at the reviewed tip of `main`. Keep deployment protection and the workflow/verifier under owner control on every allowed ref.
2. Configure authorized release operators as required reviewers for the two contract environments. Enable **Prevent self-review** and disable protection-rule bypass. Set `RELEASE_DRAIN_REVIEWER_IDS` in each contract environment to the comma-separated numeric GitHub user IDs of those operators. For the pilot, verify that the repository plan supports required reviewers and confirm in a protected rehearsal that the approval comment, operator ID and environment are returned through the Actions review history. A missing review record stops contract. An approval of the ordinary staging or production environment cannot authorize contract. [Environment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) · [Actions review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)
3. Enrol one protected `runtime_attestation.backend_marker` row per backend. Reuse the existing reviewed staging marker and preserve the staging observer's ledger read access. Enrol production through an owner-authorized operation with its own `ida.production.backend-marker.v1:<UUIDv4>` marker, distinct from staging. The migration role needs read access to the marker, controlled independently of that role. Validate that the enrolled database is empty for a first install or carries the exact reviewed ledger prefix for an upgrade.
4. In each migration environment, set `RELEASE_BACKEND_MARKER`, `RELEASE_DATABASE_HOST`, `RELEASE_DATABASE_CA_BASE64` and `RELEASE_DATABASE_ROLE_BYPASSES_RLS` as variables. The host is the reviewed direct database endpoint and the CA is its base64-encoded PEM certificate. Store the dedicated migration login URL as the environment secret `RELEASE_MIGRATION_URL`. The URL includes port `5432` and a database name and uses the hostname configured for that environment. Use the dedicated database-owner login accepted by the existing direct preflight on PG15 or PG16. It must be a non-superuser, non-replication role. Set `RELEASE_DATABASE_ROLE_BYPASSES_RLS` to the reviewed `true` or `false` posture of that role. Keep the login separate from application and observer roles. Keep the credential at environment scope. Confirm direct connectivity from the approved runner before enabling a release. A GitHub-hosted IPv4-only runner needs a reachable IPv4 direct endpoint. [Direct database connectivity](https://supabase.com/docs/guides/database/connecting-to-postgres#direct-connection)
5. In each contract environment, set `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` and provide a `VERCEL_TOKEN` with project deployment and alias read access. Provide `VERCEL_AUTOMATION_BYPASS_SECRET` when the immutable endpoint requires it. Verify that the existing staging runtime observer can collect both attestations. Keep settings, credentials and deployment protection changes in the owner operation record.

## Expand, deploy and attest drain

The expand job publishes the manifest and exact schema position. The deploy job publishes `migration-deployment-<environment>-<run>-<attempt>` with `release` and `manifestSha256`. The release object includes the immutable deployment ID, deployment attempt, attested image and Vercel output digests, and expand and contract identities. A release with multiple pending contract boundaries stops until it has an intermediate reviewed candidate.

For each contract environment independently, fence every predecessor writer. Inventory old canonical and direct web endpoints, workers, schedulers, and queued work associated with older builds. Confirm that each writer is fenced, that in-flight and prepared transactions ended, and that there are zero outstanding predecessor writes. Keep the fence and alias mapping in effect through commit. Record the writer inventory, evidence of the fence, observations and any empty categories in the protected operations record. Fresh production can attest a verified empty predecessor inventory. An unattributed writer or transaction withholds drain approval.

Create a version-1 receipt using `release` and `manifestSha256` from the deployment artifact and `invocation` for the pending contract job. Its shape is:

```json
{
  "version": 1,
  "release": {},
  "manifestSha256": "<deployment-artifact manifestSha256>",
  "invocation": {
    "environment": "staging-migration-contract",
    "runId": "<workflow run ID>",
    "attempt": "<current contract run attempt>"
  },
  "evidence": {
    "id": "<protected operations record ID>",
    "sha256": "<protected record SHA-256>",
    "writers": { "webEndpoints": [], "workers": [], "schedulers": [], "queues": [] },
    "fence": "<fence reference>",
    "outstandingWrites": 0,
    "inFlightTransactions": 0,
    "preparedTransactions": 0,
    "observedAt": "<UTC ISO timestamp with milliseconds>",
    "expiresAt": "<UTC ISO timestamp with milliseconds>"
  }
}
```

Replace the empty `release` example with the entire artifact's release object. Use an expiry within 30 minutes of observation. Set the contract environment variable `RELEASE_DRAIN_RECEIPT` to the exact JSON bytes. Compute their SHA-256 and approve only the pending contract environment with the comment `release-drain sha256:<64 lowercase hex digits>`. Verify the job, environment, attempt and deployment artifact before approving. The protected job checks the approval in GitHub's authenticated review history. It checks the alias, immutable deployment and receipt freshness under the database lock before applying contract. Its evidence includes the receipt digest, validated drain details, operator identity, invocation and outcome.

## Recovery and WP-07

- Before contract starts, CD may restore the exact staging preimage on the initial attempt after a deployment or staging gate failure. The preimage's reviewed journal must match the pre-expand ledger, and only the reviewed compatible migrations may have run since. If compatibility is unproven, keep the alias in place for operator recovery.
- A failed or withheld contract leaves the compatible deployment at expand. Retry the contract job against its original verified deploy artifact. A pending contract needs a new receipt and authenticated approval for the new attempt after the operator rechecks the fence. A redeploy requires expand preflight in the same attempt, a new artifact and a fresh receipt. An alias change invalidates the previous deployment verification.
- Once contract may have started, keep the fence and suspend automatic preimage restoration. If commit is uncertain, wait for the original database transaction to end and compare the exact ledger and affected schema with the recorded phase. On a match to the expected committed journal, a contract-job rerun is verification-only. At the exact expand prefix, a retry requires fresh approval. Recover forward, or restore an attested contract-compatible build after verifying the schema.
- WP-07 reserves `0111_wp07_rate_check_expand` and `0112_wp07_rate_check_contract` by full tag. Preserve the reviewed SQL bytes. The separately authorized WP-15 sales pause stays in force through post-contract verification, and the separately authorized restore operation reopens sales. Preserve same-week publications during recovery. After WP-07 lands, regenerate #2145's grants entry at the next free position, expected `0112`, for review as a compatible suffix. A changed journal or suffix invalidates earlier evidence.

Run the PG16 journal-parity rehearsal on the exact reviewed #2161 candidate with this gate before merge. The real-pair case activates when that candidate contains both registered tags. Record the refusal at `0110`, the successful predecessor write, and the verified transition to `0111` with both same-week rate publications preserved.
