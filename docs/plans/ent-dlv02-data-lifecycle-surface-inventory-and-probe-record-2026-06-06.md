---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-DLV02 Data Lifecycle Surface Inventory And Probe Record - 2026-06-06

> Status: Input document. This record inventories the first repo-evidenced data-lifecycle
> database and storage surfaces for a future non-production fixture proof. It does not run cleanup,
> change deletion behavior, change retention policy, change schema, or claim full data-lifecycle
> readiness.

## Identity

- Slice id: `ENT-DLV02`
- Environment inspected: local repo checkout at `df0a5f53488dc891171ef977c3e94d58b03cc64b`
- Fixture tenant id: not available
- Fixture user id: not available
- Fixture user role: not available
- Lifecycle action: not run
- Executed by: Codex repo operator
- Decision owner: platform
- Production data affected: no
- Storage object contents inspected: no

## Method

This record used static repo evidence only:

- `packages/database/src/schema/*.ts` for user-bound and tenant-scoped tables.
- `apps/web/src/features/claims/upload/server/storage-path.ts` for evidence object path shape.
- `apps/web/src/features/claims/upload/server/initial-claim-upload.ts` and
  `apps/web/src/features/claims/upload/server/shared-upload.ts` for upload-intent and object
  verification boundaries.
- `apps/web/src/lib/storage/service-role.ts` for centralized service-role storage operations.
- `docs/reviews/2026-04-25-sensitive-route-ownership-map.md` for sensitive upload, document,
  notification, share-pack, AI, and verification surfaces.
- `docs/reviews/2026-04-25-production-professionalism-rereview.md` for the open data-lifecycle
  verification gap.

No database command, provider command, storage listing, production cleanup, or lifecycle mutation was
run.

## Database Surface Inventory

This is the first repo-owned inventory for a fixture-user residue probe. It is not a substitute for
a live database inventory because actual row counts depend on seeded fixture data and provider state.

| Surface                               | Repo evidence                                                                                 | Fixture-user linkage to count                                                                                                                                                                                                                        | Probe expectation                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Identity root                         | `packages/database/src/schema/auth.ts`                                                        | `user.tenantId + user.id`; `session.userId`; `account.userId`                                                                                                                                                                                        | Count identity, session, and provider account rows before and after the chosen lifecycle action.                              |
| Claims                                | `packages/database/src/schema/claims.ts`                                                      | `claims.userId`, `claims.agentId`, `claims.staffId`, `claims.assignedById`, `claimDocuments.uploadedBy`, `claimMessages.senderId`, `claimStageHistory.changedById`                                                                                   | Count user-owned claims, actor references, evidence metadata, messages, and stage history.                                    |
| Polymorphic documents and sharing     | `packages/database/src/schema/documents.ts`                                                   | `documents.uploadedBy`, `documents.deletedBy`, `documentAccessLog.accessedBy`, `sharePacks.createdByUserId`, `sharePacks.revokedByUserId`, plus `documents.entityType/entityId` when the entity is user-owned                                        | Count document metadata, access logs, and share packs without exposing file names beyond redacted paths or hashes.            |
| Claim threads                         | `packages/database/src/schema/claim-threads.ts`                                               | `claimThreads.createdBy`, `claimThreadMessages.sentBy`, claim ownership through `claimThreads.claimId` and `claimThreadMessages.claimId`                                                                                                             | Count thread/message rows and classify immutable communication residue separately from deletable user-owned state.            |
| Member notes and audit                | `packages/database/src/schema/notes.ts`                                                       | `memberNotes.memberId`, `memberNotes.authorId`, `auditLog.actorId`, `auditLog.entityType/entityId`                                                                                                                                                   | Count direct member notes and audit actor rows; any retained audit row needs an allowed residual basis and owner.             |
| Membership, cards, settings, and push | `packages/database/src/schema/memberships.ts`                                                 | `subscriptions.userId`, `subscriptions.referredByAgentId`, `subscriptions.referredByMemberId`, `subscriptions.agentId`, `membershipFamilyMembers.userId`, `userNotificationPreferences.userId`, `pushSubscriptions.userId`, `membershipCards.userId` | Count member commercial lifecycle, preferences, push endpoints, and card rows.                                                |
| Agent commercial links                | `packages/database/src/schema/agents.ts`                                                      | `agentClients.agentId/memberId`, `agentCommissions.agentId/memberId`, `agentSettings.agentId`                                                                                                                                                        | Count rows where the fixture user is either the member or agent.                                                              |
| Referral and service usage            | `packages/database/src/schema/services.ts`                                                    | `referrals.referrerId/referredId`, `memberReferralRewards.referrerMemberId/referredMemberId`, `serviceUsage.userId`, `serviceRequests.userId/handledById`, `partnerDiscountUsage.userId`                                                             | Count rows that bind a user to referral, benefit, service, or handler activity.                                               |
| Notifications and automation          | `packages/database/src/schema/notifications.ts`; `packages/database/src/schema/automation.ts` | `notifications.userId`, `emailCampaignLogs.userId`, `automationLogs.userId`, `engagementEmailSends.userId`, `npsSurveyTokens.userId`, `npsSurveyResponses.userId`                                                                                    | Count user notification, engagement, survey, and automation residue.                                                          |
| AI and extraction provenance          | `packages/database/src/schema/ai.ts`                                                          | `aiRuns.requestedBy`, `aiRuns.reviewedBy`, `documentExtractions.reviewedBy`, linked `documentId` and entity fields                                                                                                                                   | Count AI provenance tied directly or indirectly to fixture-user documents.                                                    |
| Leads, verification, CRM, and support | `packages/database/src/schema/leads.ts`; `packages/database/src/schema/crm.ts`                | `memberLeads.agentId/convertedUserId`, `leadPaymentAttempts.verifiedBy`, `crmLeads.agentId`, `crmDeals.agentId`, `crmActivities.agentId/memberId`, `crmTasks.assignedActorId/createdById`, `crmTaskEvents.actorId`, support-handoff actor fields     | Count sales, verification, CRM, task, and support rows where the fixture user is actor, subject, assignee, or converted user. |

## Storage Surface Inventory

| Surface                            | Repo evidence                                                                                                                                                                                  | Fixture-owned path or object family                                                                                                                                    | Probe expectation                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Initial claim evidence uploads     | `apps/web/src/features/claims/upload/server/storage-path.ts`; `apps/web/src/features/claims/upload/server/initial-claim-upload.ts`; `docs/reviews/2026-04-25-sensitive-route-ownership-map.md` | `claim-evidence` bucket paths shaped as `pii/tenants/<tenantId>/claims/<actorId>/unassigned/<fileId>-<safeName>`                                                       | List redacted object keys or hashes under the fixture tenant and actor prefix before and after lifecycle action.               |
| Assigned claim evidence uploads    | `apps/web/src/features/claims/upload/server/storage-path.ts`; `apps/web/src/features/claims/upload/server/shared-upload.ts`                                                                    | `claim-evidence` bucket paths shaped as `pii/tenants/<tenantId>/claims/<claimId>/<fileId>.<ext>`                                                                       | Count objects linked to fixture-owned claims and claim documents without storing object contents.                              |
| Document signed URLs and downloads | `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`; `packages/database/src/schema/documents.ts`                                                                                        | `documents.storage_path` and legacy `claim_documents.file_path` rows                                                                                                   | Compare DB metadata to provider object listings by redacted path or hash; do not store signed URLs.                            |
| Service-role storage access        | `apps/web/src/lib/storage/service-role.ts`                                                                                                                                                     | Centralized `createTenantSignedUploadUrl`, `createTenantSignedDownloadUrl`, `uploadTenantObject`, `downloadTenantObject`, and `listTenantObjectsForSingleFile` targets | Use the centralized tenant-path assertion boundary for any future probe; do not call raw admin storage APIs in ad hoc scripts. |

## Fixture Probe Result

- Probe run: no
- Reason: no isolated non-production fixture tenant, fixture user, lifecycle action, database target,
  and storage provider target were supplied to this repo thread.
- Safety decision: blocked, not failed.
- Production data affected: no
- Secrets, raw PII, claim narratives, document contents, payment data, object contents, or signed
  URLs captured: no

Running a deletion, deactivation, anonymization, or provider-side user removal without a named
non-production target would not satisfy `ENT-DLV01` and could create unsafe evidence. The first live
probe must use a fixture environment and record only counts, redacted paths, hashes, commands, and
allowed residual bases.

## Result

- Decision: static inventory recorded; live fixture proof blocked on environment and provider
  access.
- Blocking findings:
  - No isolated non-production fixture tenant/user was available.
  - No authorized lifecycle action was provided for delete, deactivation, anonymization, or
    provider-side user removal.
  - No safe database/storage provider target was available for pre/post residue checks.
- Non-blocking findings:
  - Repo evidence now identifies the first database and storage surfaces that a fixture probe must
    count.
  - Immutable or retention-sensitive audit/communication/commercial rows must be classified with an
    explicit allowed residual basis instead of treated as accidental residue.

## Acceptance Criteria Disposition

| `ENT-DLV01` criterion                                                            | DLV02 disposition                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Isolated non-production environment or fixture tenant                            | Blocked; no target supplied.                                        |
| Fixture tenant, user, role, lifecycle action, executor, and owner recorded       | Partially recorded; fixture identity and action unavailable.        |
| Pre-lifecycle inventory covers database rows and storage prefixes or object keys | Static inventory recorded from repo evidence; live counts not run.  |
| Post-lifecycle checks rerun the same inventory                                   | Blocked; lifecycle action not run.                                  |
| Remaining rows or objects have allowed residual basis and owner                  | Requirement carried forward; no live residue exists in this record. |
| Evidence stores counts, redacted paths, hashes, or command metadata only         | Satisfied for this static record.                                   |
| Named owner records pass/fail                                                    | Platform owner records blocked static disposition.                  |
| Every blocker has follow-up issue, PR, or explicit risk owner                    | Follow-up lane remains in this register; platform owns the blocker. |

## Next Repo-Owned Slice

The data-lifecycle lane is blocked on external fixture/provider access. The next unblocked
repo-owned enterprise slice should create the future contract:

`ENT-PERF01 Performance Regression Gate Evidence Contract`

That slice should scope representative route and storage performance budgets that can block
releases. It must not change runtime behavior, auth, tenancy, routing, billing, product UI, proxy,
README, AGENTS, schema, RLS, or broad architecture docs unless later evidence requires a separately
approved implementation slice.
