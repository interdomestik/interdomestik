# Owner-run shared database migration

The DATA-03 pilot uses this CLI for all staging and production schema migrations. The owner controls the direct database-owner credential, the runner checkout, the verification key, and the deploy and writer fence. WP-15 owns later CD integration. The disposable Drizzle migrator continues to apply its entire journal.

## Pin the runner, policy and release inputs

1. In an owner-controlled directory, make a detached checkout at the full independently reviewed runner commit. Verify the commit against the review record and verify a clean tree. Install the checkout's frozen dependencies in that trusted directory with migration and deployment credentials absent. Run the commands below from this checkout, using its Node, pnpm, tsx, verifier and `packages/database/drizzle/contract-phases.json`. Keep the checkout and its dependencies under owner control.
2. Verify the exact reviewed release candidate commit independently. Use `git archive "$candidate_commit" packages/database/drizzle | tar -x -C "$candidate_export"` from the candidate repository to export the reviewed journal and SQL to a private directory. Supply `"$candidate_export/packages/database/drizzle"` as `candidate_drizzle` below. Run only the pinned runner with credentials. Its `inspect` command reads the export as data and reports the journal hash, hash of the ordered journal entries and their SQL hashes, owner registry hash, and phase entry identities.
3. Put the following values in an owner-controlled JSON config outside both checkouts and set `RELEASE_PHASE_CONFIG` to its path. Use `version` 1, `environment` (`staging` or `production`), `commitSha` (the reviewed candidate SHA), and `journalSha256`, `ledgerSha256` and `registrySha256` from `inspect`. Set `endpoint` to the enrolled direct `db.<project-ref>.supabase.co:5432` host and port, and pin `caSha256` (decoded CA PEM bytes), `backendMarkerSha256` (exact enrolled marker text without a trailing newline), `publicKeySha256` (exact public PEM bytes), `expectedRolsuper` (false), `expectedRolbypassrls` (the reviewed migration role setting), and the Vercel `teamId` and `projectId`. Maintain separate config and enrollment for each environment.
4. Provision the database through the existing owner enrollment process. The CLI expects the enrolled `runtime_attestation.backend_marker` and its schema to be owner-controlled. The migration role must own the database, `public` and its objects, and any existing Drizzle ledger and sequence. Restrict schema creation and ledger mutation to the migration authority. Supply the direct TLS URL as `RELEASE_MIGRATION_URL` and its CA PEM in `RELEASE_DATABASE_CA_BASE64` through the owner credential mechanism. Supply deployment-read `VERCEL_TOKEN` for contract and `VERCEL_AUTOMATION_BYPASS_SECRET` if the immutable deployment requires it. Keep credentials out of candidate checkouts, arguments, evidence and logs.

From the pinned runner checkout:

```sh
pnpm exec tsx scripts/ci/migration-phase/run.mjs "$candidate_drizzle" inspect
pnpm exec tsx scripts/ci/migration-phase/run.mjs "$candidate_drizzle" > "$RELEASE_PHASE_MANIFEST"
```

The second command defaults to expand. Keep its stdout manifest as exact bytes in an owner-controlled file. Expand commits through the entry immediately before the first pending contract. Each contract invocation applies one boundary, and a later expand applies the compatible suffix through the next pending boundary. WP-07 expects the grants entry at `0110`, expand at `0111_wp07_rate_check_expand` and contract at `0112_wp07_rate_check_contract`. The owner registry also pins the reviewed bytes of both phase entries. A journal or SQL byte change requires a new pin, rehearsal, manifest and approval.

## Sign a contract attempt under the deployment and writer fence

Generate a dedicated Ed25519 key as the owner on the signing system. Use OpenSSL 3. Keep the private key encrypted with owner-only access outside the checkout and the release runner. Transfer only the public key and detached signatures to the runner. Pin the printed public-key fingerprint in the owner config and set `RELEASE_PHASE_PUBLIC_KEY` to the independently installed public key path.

```sh
umask 077
openssl genpkey -algorithm ED25519 -aes-256-cbc -out "$owner_signing_dir/phase-private.pem"
openssl pkey -in "$owner_signing_dir/phase-private.pem" -pubout -out "$owner_signing_dir/phase-public.pem"
shasum -a 256 "$owner_signing_dir/phase-public.pem"
```

Deploy the reviewed, expand-compatible build and check its immutable Vercel deployment and canonical alias. Before collecting evidence, establish exclusive control over deploys, rollbacks and alias changes. Wait for any that could restore a predecessor to finish. Fence predecessor writes from direct endpoints, worker processes, schedulers and queued or retried work. Drain in-flight transactions and resolve any prepared transactions. Keep the deploy and writer fence through a confirmed contract commit or verified recovery. A fresh production system can use a verified empty writer inventory. The staging hold supplies no drain evidence.

Prepare a fresh receipt for one invocation, with these fields.

| Field                     | Value                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`, `environment`  | 1 and the environment from the owner config                                                                                                                                                                                                                                                                   |
| `manifestSha256`          | SHA-256 of the exact manifest file. The manifest binds the backend, reviewed commit, journal, exact expand prefix, and both entries' full tags, hashes and timestamps.                                                                                                                                        |
| `attempt`                 | A new 32-byte hex nonce from `openssl rand -hex 32`. Set `RELEASE_PHASE_ATTEMPT` to this value for the invocation.                                                                                                                                                                                            |
| `deployment`              | `id` (the immutable Vercel deployment attempt ID), `hostname` (its immutable `*.vercel.app` hostname), `imageDigest`, `buildDigest` (the source image and Vercel output digests as `sha256:<hex>`), `aliasUid` and `aliasUpdatedAt` (the canonical alias UID and provider update time in epoch milliseconds). |
| `drain`                   | `fenceId`, `evidenceSha256` (digest of the retained drain and deploy-fence evidence), and the inventories `webEndpoints`, `workers`, `schedulers`, `queues` as arrays of stable IDs. `outstandingWrites`, `inFlightTransactions` and `preparedTransactions` must each be 0.                                   |
| `observedAt`, `expiresAt` | Epoch milliseconds. Observe after the last alias update and expire within ten minutes of observation.                                                                                                                                                                                                         |

Inspect the provider's alias history or deployment audit as part of the evidence. Any redeployment or alias assignment after observation invalidates the receipt, including a move away and back. The CLI compares the live alias UID, update time and destination immediately before applying contract, along with the immutable deployment and build attestation. If the provider omits the alias revision or the operator cannot establish that the fence held, obtain fresh evidence before proceeding. [Vercel alias API](https://vercel.com/docs/rest-api/aliases/get-an-alias)

Set `RELEASE_PHASE_RECEIPT` and `RELEASE_PHASE_SIGNATURE` to the exact receipt and binary signature files. Sign on the owner system over the approved bytes, including whitespace. Then invoke contract from the pinned checkout.

```sh
openssl pkeyutl -sign -rawin -inkey "$owner_signing_dir/phase-private.pem" \
  -in "$RELEASE_PHASE_RECEIPT" -out "$RELEASE_PHASE_SIGNATURE"
pnpm exec tsx scripts/ci/migration-phase/run.mjs "$candidate_drizzle" contract
```

The runner reserves the nonce in `drizzle.__release_contract_attempts` before contract SQL, under the same session lock. A failed execution after reservation consumes the approval. Keep the nonce records with the shared ledger. Retire the receipt even if the invocation fails before it can reach the database. A retry at expand requires a new nonce and signed receipt after the owner rechecks the writer and deployment fence.

## Recovery and predecessor builds

Before contract, restore a predecessor only with evidence that the exact predecessor build can write against expand. Once contract may have started, keep the fence and recover forward or use an attested contract-compatible build. Preserve same-week rate publications. The separately authorized WP-15 sales pause and restore continue to govern sales admission.

For an uncertain commit, keep the original manifest and fence. Run the verification-only command from the pinned checkout. It must acquire the same database lock, which waits for the original transaction/session to end. If the lock times out, wait and run recovery again. An exact contract ledger and matching schema return `verified-committed`. `RECOVERY_AT_EXPAND` means the exact expand prefix and schema remain. Recheck the fence and obtain a fresh approval before retrying contract. Any other ledger or schema divergence stops recovery.

```sh
pnpm exec tsx scripts/ci/migration-phase/run.mjs "$candidate_drizzle" recover
```

## Guarded PG16 rehearsal

Use a disposable loopback PostgreSQL 16 instance and set `DATABASE_URL` for it. Rehearse from the independently reviewed runner checkout on M5. Run against the exact #2161 candidate export containing the renumbered pair. Keep the candidate commit, `inspect` output and test result together.

```sh
mac_job=/Users/arbenlila/development/rc31-scratch/verify-scripts/mac-job
runner_head=$(git rev-parse HEAD)
REQUIRE_JOURNAL_SCHEMA_PARITY=1 REQUIRE_RELEASE_PHASE_WP07=1 \
  RELEASE_PHASE_WP07_CANDIDATE="$candidate_drizzle" RELEASE_PHASE_WP07_COMMIT="$candidate_commit" \
  "$mac_job" run pre-check release-phase-pg16 "$PWD" "$runner_head" -- pnpm db:journal:parity
```
