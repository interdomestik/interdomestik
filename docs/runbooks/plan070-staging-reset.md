# Plan070 staging dataset reset

This is an operator procedure only. Merging PR 5 does not authorize any step below.
Every step needs separate, recorded owner approval for the named target and source SHA.
Stop on missing evidence, target mismatch, restore failure or migration drift.
Never read `.env*` values, echo connection strings, or put credentials in receipts.

1. **Owner approval required — identify and freeze the target.**
   Record the reviewed source SHA, catalogue hash, seed version and UTC `asOf`.
   Identify staging in the Supabase dashboard as project `xjyseqtfuxcuviiankhy`.
   Independently verify the operator-supplied database connection targets either
   `db.xjyseqtfuxcuviiankhy.supabase.co` or a Supabase pooler with username
   `postgres.xjyseqtfuxcuviiankhy`. Record only the public project ref and classification.
   Confirm configured public Supabase URLs/project markers refer to the same staging project.
   Production is `gunosplgrvnvrftudttr`: never seed or reset it, even with reset flags or tokens.
   Stop on any production marker. Pause staging writes, scheduled jobs and concurrent gate runs.

2. **Owner approval required — turn off external email before any rebuild.**
   Disable staging outbound mail credentials/routes and scheduled email/campaign jobs in
   the approved operator control plane. Ensure SMTP and Resend cannot reach an external
   recipient, including dunning and sponsor paths; a DNS-invalid recipient alone is insufficient.
   Disable Supabase Auth email delivery too if configured, although application identity
   remains Better Auth. Record the disabled transports without their credentials.
   PR 5 suppresses recipients under the reserved `.invalid` TLD at external SMTP/Resend boundaries.
   Keep the existing opted-in automated loopback Mailpit catcher for OTP/invite/reset journeys;
   verify catcher receipt and zero external-provider attempts. Never enable a real provider to bypass suppression.

3. **Owner approval required — back up database, auth and storage.**
   Use the approved Supabase backup/export workflow to capture a consistent database backup
   including application data, Better Auth users/accounts, required database roles/grants,
   migration ledgers, Supabase `auth` records (if present), and storage metadata.
   Export every storage object's bytes separately: database/storage metadata is not an object backup.
   Save a bucket/path/version/size/checksum manifest, bucket settings and access-policy metadata.
   Preserve the approved auth/provider configuration and necessary restore credentials in the
   restricted operator secret store; do not include them in Git, terminal output or the receipt.
   Record backup identifiers, UTC timestamps, checksums, source project ref and restricted locations.

4. **Owner approval required — prove restoration before deleting anything.**
   Restore the backup to an isolated disposable non-production project with external delivery off.
   Restore the required auth configuration and storage objects as well as DB records/metadata.
   Compare table counts, fixture ownership, representative Better Auth logins and storage-byte
   checksums against the backup manifest. Verify role/tenant denials and private object access.
   Record successful restore evidence and a rollback owner/time window. Stop if any part fails.
   Approve retirement of the disposable restore project separately after retaining the evidence.

5. **Owner approval required — read staging migration drift before reset.**
   Read staging's migration history and compare applied names/checksums against the reviewed
   checkout, including Drizzle/Supabase ledgers actually used by the repository deployment flow.
   Record missing, extra, reordered and checksum-mismatched entries. The historical 91/97 observation
   was production evidence; it says nothing about staging migration state.
   Do not mark migrations applied, repair a ledger or run a reset to hide drift.
   Obtain a separate approved reconciliation plan, apply only that plan, and read back the result.
   Proceed only with accepted migration state and the successful restore drill from step 4.

6. **Owner approval required — rebuild only from the E2E catalogue.**
   In a protected operator shell, supply the verified staging `DATABASE_URL` without printing it.
   Require `SEED_TARGET_CONFIRM=plan070:xjyseqtfuxcuviiankhy` for this exact project.
   The token is public confirmation text, not authorization or a production override.
   Run the reviewed commands only after the owner authorizes this destructive operation:

   ```sh
   SEED_TARGET_CONFIRM=plan070:xjyseqtfuxcuviiankhy pnpm --filter @interdomestik/database seed:e2e -- --reset
   SEED_TARGET_CONFIRM=plan070:xjyseqtfuxcuviiankhy pnpm --filter @interdomestik/database seed:assert-e2e
   ```

   Never supplement the catalogue with `seed:full` or `seed:workload`.
   Read back seed receipt/version, catalogue hash, `asOf`, source SHA and all invariants.
   Verify exactly 85 synthetic user identities (ceiling 100), distinct normalized mailboxes,
   all under `plan070.example.invalid`, and no legacy counterpart for an exact catalogue ID/tenant.
   Legacy cleanup is exact ID + tenant + old email, never a blanket product-domain deletion.
   Resolve historical non-catalogue staging users separately; this procedure does not authorize
   deleting arbitrary users, truncating tables or changing schema/RLS.

7. **Owner approval required — run nine-role journeys and denials.**
   Use the reviewed role matrix and catalogue keys through normal UI login, with synthetic data only:

   | Runtime role   | Catalogue key     |
   | -------------- | ----------------- |
   | super_admin    | SUPER_ADMIN       |
   | admin          | MK_ADMIN          |
   | tenant_admin   | KS_ADMIN          |
   | global_support | GLOBAL_SUPPORT    |
   | auditor        | AUDITOR           |
   | branch_manager | KS_BRANCH_MANAGER |
   | staff          | KS_STAFF          |
   | agent          | KS_AGENT          |
   | member         | KS_MEMBER         |

   Verify canonical landing routes, displayed role/tenant, named lifecycle/discovery/documents/
   share-pack/message scenarios, and cross-role/cross-tenant read/write denials.
   Use dedicated mutation copies for approved write journeys, never mutate the golden baseline.
   Confirm stale legacy mailboxes cannot log in. Keep external email disabled throughout.
   Record source-bound results and failures; do not convert this step into production acceptance.

8. **Owner approval required — accept staging or restore.**
   Keep staging writes/jobs paused until the owner accepts the journey evidence.
   On failure, use the proved rollback workflow to restore DB/auth/storage together, verify the
   restore manifest again, and retain the failed attempt. Do not retry resets to conceal failures.
   Re-enable only explicitly approved staging services. External email remains off unless separately
   authorized. Record technical staging acceptance separately from human acceptance and production.
