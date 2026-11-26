# WP-16.1 sponsor runtime grants release record for #2145

## Pilot guardrails

The 2026-11-26 owner delegation allowed the lead and Astra to decide this R-37 change together. The lead's implementation brief records concurrence and authorization for design v3. Astra round three, served by gpt-6.2-astra at high effort, reviewed integration commit `2fc9812046d2505b8db02b004c506ccee453f9a6` and returned **YES**, including the R-12 exception. The reviewed design SHA-256 is `0f2e9e3f3cd6e6a0bbfa8d8030f90b9b1955234fa50f7d5ff39a1b2d1521a96b`. The delegation, design, lead brief and round-three verdict are in the restricted `wp16-1-merge-7a46` audit record. Record the exact implementation verdict in the final review evidence.

R-12 permits the release owner to grant the following direct column-level `UPDATE` privileges to `interdomestik_runtime_rls`, without grant option, inside the serialized release migration step. Admission requires a closed fresh target with its applied ledger verified exactly through `0104_wp07_rate_verification_age`. Application traffic and jobs stay closed across retries and through final attestation.

| Relation                                | Column                  |
| --------------------------------------- | ----------------------- |
| `public.claim`                          | `"updatedAt"`           |
| `public."user"`                         | `"updatedAt"`           |
| `public.claim_escalation_agreements`    | `updated_at`            |
| `public.subscriptions`                  | `dunning_attempt_count` |
| `public.membership_plans`               | `id`                    |
| `public.sponsor_terms`                  | `terminated_at`         |
| `public.sponsor_roster_entries`         | `outcome`               |
| `public.claim_recovery_no_fee_evidence` | `updated_at`            |
| `public.claim_transition_evidence`      | `id`                    |
| `public.claim_messages`                 | `read_at`               |

A later migration cannot satisfy the unchanged 0105 privilege predicate. This checkpoint preserves the original journal and role-presence checks, supplies only the required direct privileges and gates the suffix on ten provenance and effective-privilege checks. While the ledger still ends at 0104, retry may reuse these grants and explicit abandonment may revoke only the recorded additions from the abandoned attempt. After 0105, apply reconciliation and rollback as new journaled SQL.

## Migration notes and evidence

- The WP-15 release step supplies its session-pinned owner connection, a Drizzle session on that connection, closed-target evidence, the approved effective ACL baseline and runtime verification to `runSponsorReleaseMigrations`. Keep the application and jobs closed until it returns with the full verified ledger and successful attestation. The runner supports a fresh target and an already-migrated target with a verified post-0105 ledger. Review and reconcile any prior missed or additional privileges against the WP-15 baseline.
- Preserve the verified target identity, ledger hashes and timestamps, owner and role posture, database and schema access, membership and creator defaults. Store the before-checkpoint and before-trailing ACL reports, the ten checkpoint results, the after-trailing report and any retry or reversal under the release target's evidence. Include direct table and column ACLs with grantors and grant options, effective privileges and grant options, and trigger definitions.
- Record the actual additions and removals for each phase. For each removed legacy `UPDATE(id)`, record the role, grantor and previous grant option and mark the replacement as added or already present. Record each guard separately. Report the live evidence for the relevant PostgreSQL 16 lane, its exit status, denied SQLSTATEs and runtime current-user and tenant results. Attach the exact implementation review after those checks.
- The PG16 proof uses the checked-in journal and isolated fixture dependencies. WP-15's approved ACL artifact and live deployment binding are required for release attestation. The fixture grants confer no release authority. PG16 and target evidence are pending.

## Recovery

**Application rollback.** Retain the privileges required by the deployed build. Verify the build's restricted-role paths before reopening traffic and jobs.

**Privilege rollback after 0105.** Close affected traffic and jobs. Apply a new forward migration that reverses only the target's recorded ACL delta. Preserve the 0105 prerequisites and previously approved grants. Restore each removed legacy privilege with its recorded grantor and grant option. Revoke a replacement only if the original migration added it. Keep a lock guard for as long as the corresponding runtime ID-update privilege is effective. Fresh-build rollback treats all ten checkpoint grants, including `sponsor_terms.terminated_at` and `sponsor_roster_entries.outcome`, as prior grants. Legacy rollback uses the applicable target preimage. Keep the target closed while rehearsing restored legacy access.

**Abandonment at 0104.** Give `abandonSponsorCheckpoint` the before and checked evidence for the same attempt and target. It verifies the unchanged 0104 ledger and current ACL, reverses the attempt's recorded additions, and records the restored ACL. Keep the abandoned database closed.

For each recovery path record the resulting ACL, guards, applied ledger and restricted-role outcomes. Require the serving application's approved ACL before reopening.

## M5 proof commands

Use the isolated PostgreSQL 16 service configuration from the corresponding CI job. The advisory lane requires a separately fresh `interdomestik_test` database. Run these commands from the repository root.

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test \
  REQUIRE_JOURNAL_SCHEMA_PARITY=1 pnpm db:journal:parity

CI=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test \
  pnpm db:migrate
env -u DATABASE_URL_RLS -u E2E_DATABASE_URL -u E2E_SERVER_DATABASE_URL_RLS \
  CI=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test \
  node scripts/ci/db-lanes/run.mjs pg16
```
