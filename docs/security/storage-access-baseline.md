---
status: baseline
date: 2026-05-09
owner: platform
source_slice: P33-DG08
---

# Storage Access Baseline

This baseline is the repo-canonical input for `P33-DG08 Storage RLS Backstop Design
Review`.

## Supabase Guidance Receipt

Supabase Storage access control is implemented with RLS policies on
`storage.objects`. Supabase documents path helper functions such as
`storage.foldername(name)` for policy predicates and notes that uploads require
`INSERT` policies, with `SELECT` and `UPDATE` additionally needed for upsert.

The service role key is different: Supabase documents that service keys bypass
RLS and grant unrestricted Storage API access. Therefore a Storage RLS policy can
backstop authenticated anon/user clients, but it cannot constrain
`createAdminClient()` or any Storage client initialized with
`SUPABASE_SERVICE_ROLE_KEY`.

## Bucket Inventory

| Bucket           | Source                                                                                                              | Current bucket posture | Notes                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `claim-evidence` | `supabase/migrations/00002_claim_evidence_bucket.sql`, `supabase/migrations/00008_ensure_claim_evidence_bucket.sql` | private                | Evidence bucket; default name also exposed by `apps/web/src/lib/storage/evidence-bucket.ts`. |
| `policies`       | `supabase/migrations/00007_policies_bucket.sql`                                                                     | private                | Policy document bucket.                                                                      |

Current distinct bucket count from repo migrations: `2`.

## Storage Policy Inventory

Current Storage policies are not aligned with the app's current tenant-prefixed
paths:

| Bucket           | Current policy family           |
| ---------------- | ------------------------------- |
| `claim-evidence` | service role full access        |
| `claim-evidence` | member insert/select/delete     |
| `claim-evidence` | voice-note insert/select/delete |
| `policies`       | service role full access        |
| `policies`       | member insert/select/delete     |

Current policy predicates (SQL `||` operators cannot be safely embedded in markdown table cells):

```sql
-- claim-evidence: service role full access
bucket_id = 'claim-evidence' AND auth.role() = 'service_role'

-- claim-evidence: member insert/select/delete
name LIKE ('pii/claims/' || auth.uid() || '/%')

-- claim-evidence: voice-note insert/select/delete
name LIKE ('pii/claims/' || auth.uid() || '/voice-notes/%')

-- policies: service role full access
bucket_id = 'policies' AND auth.role() = 'service_role'

-- policies: member insert/select/delete
name LIKE ('pii/policies/' || auth.uid() || '/%')
```

The current application writes tenant-prefixed paths under `pii/tenants/...`, so
the existing authenticated-user policies are legacy-shaped and do not provide a
tenant-prefix backstop for the active paths.

## Service-Role Storage Callsite Inventory

Current `createAdminClient()` Storage callsites in `apps/web/src`: `11`.

| Path                                                             | Operation family    | Risk tier | Risk note                                                                            |
| ---------------------------------------------------------------- | ------------------- | --------- | ------------------------------------------------------------------------------------ |
| `apps/web/src/app/api/claims/evidence-upload/route.ts`           | direct upload       | Medium    | Admin/staff evidence upload uses service-role Storage write after app authorization. |
| `apps/web/src/app/api/documents/[id]/route.ts`                   | signed download URL | High      | Download URL creation depends on app-side document access checks.                    |
| `apps/web/src/app/api/documents/[id]/download/route.ts`          | direct download     | High      | File download depends on app-side document access checks.                            |
| `apps/web/src/app/api/documents/[id]/download/_core.ts`          | direct download     | High      | Duplicate/core path for document download service adapter.                           |
| `apps/web/src/app/api/documents/[id]/_core.ts`                   | signed download URL | High      | Duplicate/core path for document signed URL service adapter.                         |
| `apps/web/src/lib/ai/claim-workflows.ts`                         | direct download     | High      | Background AI workflow reads queued claim evidence by stored path.                   |
| `apps/web/src/app/api/policies/analyze/_services.ts`             | upload              | Medium    | Policy upload writes tenant-prefixed path using service role.                        |
| `apps/web/src/app/api/policies/analyze/_services.ts`             | direct download     | High      | Background policy analysis reads queued policy files by stored path.                 |
| `apps/web/src/app/api/uploads/_core.ts`                          | signed upload URL   | High      | Claim upload URL creation depends on app-side claim/tenant checks.                   |
| `apps/web/src/features/admin/claims/server/getOpsClaimDetail.ts` | signed download URL | High      | Admin claim detail creates links after app-side claim access.                        |
| `apps/web/src/app/[locale]/admin/claims/[id]/_core.ts`           | signed download URL | High      | Admin claim detail core creates links after app-side claim access.                   |

Additional service-role Storage clients not counted in the `createAdminClient()`
total:

| Path                                                          | Operation family                               | Risk tier | Risk note                                                                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/claims/upload/server/shared-upload.ts` | signed upload URL and object list verification | High      | Creates its own `@supabase/supabase-js` service-role client from `SUPABASE_SERVICE_ROLE_KEY`; high tier because it signs upload URLs even though its list verification is metadata-scoped. |
| `apps/web/src/actions/uploads/upload.ts`                      | upload and signed download URL                 | High      | Voice-note upload initializes a service-role client directly; high tier because it can issue a signed download URL.                                                                        |

Risk-tier summary:

| Risk tier | Count | Includes                                                                        |
| --------- | ----: | ------------------------------------------------------------------------------- |
| High      |    11 | Signed download URLs, signed upload URLs, and direct object reads.              |
| Medium    |     2 | Direct service-role uploads without a read/sign operation in the same callsite. |
| Low       |     0 | No production Storage callsite was classified as test-only or seed-only.        |

## Active Path Templates

Current active app paths are tenant-prefixed:

| Use                     | Template                                                                 | Source                                                       |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Assigned claim evidence | `pii/tenants/{tenantId}/claims/{claimId}/{fileId}.{ext}`                 | `apps/web/src/features/claims/upload/server/storage-path.ts` |
| Initial claim evidence  | `pii/tenants/{tenantId}/claims/{actorId}/unassigned/{fileId}-{safeName}` | `apps/web/src/features/claims/upload/server/storage-path.ts` |
| Policy files            | `pii/tenants/{tenantId}/policies/{userId}/{timestamp}_{safeName}`        | `apps/web/src/app/api/policies/analyze/_services.ts`         |

Legacy Storage policies still reference older non-tenant prefixes:

- `pii/claims/{auth.uid()}/...`
- `pii/claims/{auth.uid()}/voice-notes/...`
- `pii/policies/{auth.uid()}/...`

## Baseline Conclusion

The smallest meaningful follow-up is not a broad storage rewrite. It is a
storage-boundary hardening slice that:

1. adds tenant-prefix Storage RLS policies for current `pii/tenants/...` paths;
2. retires or quarantines legacy `pii/claims/{uid}` and `pii/policies/{uid}`
   policies only after proving whether legacy objects still exist;
3. centralizes service-role Storage use behind path-asserting wrappers so routes
   cannot call Storage with caller-shaped bucket/path pairs;
4. adds a guard that prevents new direct service-role Storage callsites outside
   the approved storage boundary.

## P33-SEC06 Implementation Receipt

SEC06 implements the DG08 backstop without broad Storage redesign. The migration
`supabase/migrations/00009_storage_tenant_prefix_backstop.sql` first runs a
legacy-object preflight for `pii/claims/%`, `pii/claims/%/voice-notes/%`, and
`pii/policies/%`. If any legacy object remains, the migration raises an
exception before retiring the legacy authenticated-user policies.

The tenant join is explicit: `private.current_tenant_id()` is a
`SECURITY DEFINER` helper that joins `(SELECT auth.uid())::text` to
`public."user".id` and returns `public."user".tenant_id`. The new
`storage.objects` policies use `storage.foldername(name)` to require:

```sql
-- claim-evidence
bucket_id = 'claim-evidence'
AND (storage.foldername(name))[1] = 'pii'
AND (storage.foldername(name))[2] = 'tenants'
AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
AND (storage.foldername(name))[4] = 'claims'

-- policies
bucket_id = 'policies'
AND (storage.foldername(name))[1] = 'pii'
AND (storage.foldername(name))[2] = 'tenants'
AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
AND (storage.foldername(name))[4] = 'policies'
```

Service-role Storage access is centralized in
`apps/web/src/lib/storage/service-role.ts`, backed by pure path assertions in
`apps/web/src/lib/storage/tenant-prefix.ts`. The wrapper asserts bucket family,
tenant prefix, no traversal, no empty path segment, and no sibling-prefix tenant
match before upload, download, signed upload URL, signed download URL, or
single-file metadata list calls reach Supabase Storage.

The 13 service-role Storage callsites from the baseline now route through that
boundary. `scripts/check-service-role-storage-boundary.mjs` is wired into
`pnpm security:guard` so new direct `createAdminClient().storage` or
`SUPABASE_SERVICE_ROLE_KEY` Storage callsites under `apps/web/src` fail the
security guard unless they are in the approved boundary module.

Signed download URLs use the shared `SIGNED_DOWNLOAD_TTL_SECONDS = 300` default.
Voice-note previews keep a bounded `VOICE_NOTE_PREVIEW_TTL_SECONDS = 600`
because they are returned immediately after upload for playback. Signed upload
URL token lifetime is still Supabase-managed by the SDK; app-level upload intent
tokens remain bounded at 15 minutes. SEC06 does not eliminate bearer signed URL
exfiltration or service-role key compromise risk; it reduces the app-side blast
radius by rejecting untenant-prefixed paths before service-role Storage calls and
keeps CSP enforce-mode dependency tracked separately under the blocked CSP
migration line.
