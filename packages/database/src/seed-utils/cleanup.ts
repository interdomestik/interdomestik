import { inArray, like, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';

export async function cleanupByPrefixes(
  db: PostgresJsDatabase<typeof schema>,
  dbSchema: typeof schema,
  prefixes: string[],
  cleanupEmails = true
) {
  const targetEmailPatterns = [
    'admin.%@interdomestik.com',
    'staff.%@interdomestik.com',
    'bm.%@interdomestik.com',
    'agent.%@interdomestik.com',
    'member.%@interdomestik.com',
    'ks.%@interdomestik.com',
    'mk.%@interdomestik.com',
  ];

  if (!prefixes.length) return;

  const likePatterns = prefixes.map(p => `${p}%`);
  // const orClause = (col: any) => or(...likePatterns.map((p) => like(col, p))); // Helper if needed, but we'll map manually for typing

  console.log(`🧹 Cleaning up data with prefixes: ${prefixes.join(', ')}...`);

  // 1. Identify Claims and clean up related children first (Manual cascade)
  const claimIdPrefixes = likePatterns;
  const claimIdsToDelete = await db.query.claims.findMany({
    where: or(...claimIdPrefixes.map(p => like(dbSchema.claims.id, p))),
    columns: { id: true },
  });

  const allClaimIds = claimIdsToDelete.map(c => c.id);

  if (allClaimIds.length > 0) {
    if (dbSchema.supportHandoffs) {
      await db
        .delete(dbSchema.supportHandoffs)
        .where(inArray(dbSchema.supportHandoffs.claimId, allClaimIds));
    }
    if (dbSchema.claimEscalationAgreements) {
      await db
        .delete(dbSchema.claimEscalationAgreements)
        .where(inArray(dbSchema.claimEscalationAgreements.claimId, allClaimIds));
    }
    if (dbSchema.claimTrackingTokens) {
      await db
        .delete(dbSchema.claimTrackingTokens)
        .where(inArray(dbSchema.claimTrackingTokens.claimId, allClaimIds));
    }
    // Manual cascade: claim_threads has FK -> claim with ON DELETE NO ACTION.
    // If threads exist for a claim, deleting the claim without deleting threads will fail.
    if (dbSchema.claimThreads) {
      await db
        .delete(dbSchema.claimThreads)
        .where(inArray(dbSchema.claimThreads.claimId, allClaimIds));
    }
    await db
      .delete(dbSchema.claimDocuments)
      .where(inArray(dbSchema.claimDocuments.claimId, allClaimIds));
    await db
      .delete(dbSchema.claimMessages)
      .where(inArray(dbSchema.claimMessages.claimId, allClaimIds));
    await db
      .delete(dbSchema.claimStageHistory)
      .where(inArray(dbSchema.claimStageHistory.claimId, allClaimIds));
  }

  // Now delete the claims themselves
  await db
    .delete(dbSchema.claims)
    .where(or(...claimIdPrefixes.map(p => like(dbSchema.claims.id, p))));

  // 1b. Delete Claim Counters (Reset generation state) for cleanliness
  // We delete all claimCounters if this looks like a full reset (golden/pack prefixes)
  // This ensures generateClaimNumber starts fresh for the tenant.
  const isGoldenReset = prefixes.some(p => p.includes('golden') || p.includes('pack'));
  if (isGoldenReset && dbSchema.claimCounters) {
    // We can't easily filter by tenant without knowing them, implies full reset is safe for these prefixes
    await db.delete(dbSchema.claimCounters);
  }

  // 2. Delete Lead Payment Attempts (Delete children first)
  await db
    .delete(dbSchema.leadPaymentAttempts)
    .where(or(...likePatterns.map(p => like(dbSchema.leadPaymentAttempts.id, p))));

  // 3. Delete Member Leads
  await db
    .delete(dbSchema.memberLeads)
    .where(or(...likePatterns.map(p => like(dbSchema.memberLeads.id, p))));

  // 4. Delete Subscriptions & Cards
  await db
    .delete(dbSchema.membershipCards)
    .where(or(...likePatterns.map(p => like(dbSchema.membershipCards.subscriptionId, p))));
  await db
    .delete(dbSchema.subscriptions)
    .where(or(...likePatterns.map(p => like(dbSchema.subscriptions.id, p))));

  // 5. Delete Agent Clients
  // await db.delete(dbSchema.agentClients).where(...) // IDs usually uuid? or prefixed?

  // 6. Delete Sessions & Accounts (Delete children of user first)
  // Delete by User ID prefix
  const userIdConditions = likePatterns.map(p => like(dbSchema.account.userId, p));
  if (userIdConditions.length > 0) {
    await db.delete(dbSchema.account).where(or(...userIdConditions));
    await db
      .delete(dbSchema.session)
      .where(or(...likePatterns.map(p => like(dbSchema.session.userId, p))));
  }

  // Also delete accounts/sessions for the email-based users
  if (cleanupEmails) {
    const emailUserIds = await db.query.user.findMany({
      where: or(...targetEmailPatterns.map(p => like(dbSchema.user.email, p))),
      columns: { id: true },
    });
    if (emailUserIds.length > 0) {
      const ids = emailUserIds.map(u => u.id);
      // Delete their accounts/sessions explicitly too
      await db
        .delete(dbSchema.account)
        .where(or(...ids.map(id => like(dbSchema.account.userId, id))));
      await db
        .delete(dbSchema.session)
        .where(or(...ids.map(id => like(dbSchema.session.userId, id))));
    }
  }

  // 7. Clean up Users and their dependencies comprehensively
  // Collect all User IDs to be deleted (both by prefix and email)
  const usersByPrefix = await db.query.user.findMany({
    where: or(...likePatterns.map(p => like(dbSchema.user.id, p))),
    columns: { id: true },
  });

  let usersByEmail: { id: string }[] = [];
  if (cleanupEmails) {
    usersByEmail = await db.query.user.findMany({
      where: or(...targetEmailPatterns.map(p => like(dbSchema.user.email, p))),
      columns: { id: true },
    });
  }

  const allUserIds = Array.from(
    new Set([...usersByPrefix.map(u => u.id), ...usersByEmail.map(u => u.id)])
  );

  if (allUserIds.length > 0) {
    console.log(`  Found ${allUserIds.length} users to clean up. removing dependencies...`);

    if (dbSchema.supportHandoffs) {
      await db
        .delete(dbSchema.supportHandoffs)
        .where(
          or(
            inArray(dbSchema.supportHandoffs.memberId, allUserIds),
            inArray(dbSchema.supportHandoffs.staffId, allUserIds),
            inArray(dbSchema.supportHandoffs.acceptedById, allUserIds),
            inArray(dbSchema.supportHandoffs.reassignedById, allUserIds),
            inArray(dbSchema.supportHandoffs.closedById, allUserIds),
            inArray(dbSchema.supportHandoffs.publicResponseById, allUserIds),
            inArray(dbSchema.supportHandoffs.publicResponseAcknowledgedById, allUserIds)
          )
        );
    }

    // CRM gate specs may leave rows that reference seeded users with NO ACTION FKs
    // if a previous run is interrupted. Remove those dependents before user cleanup.
    const crmLeadIds = dbSchema.crmLeads
      ? (
          await db.query.crmLeads.findMany({
            where: inArray(dbSchema.crmLeads.agentId, allUserIds),
            columns: { id: true },
          })
        ).map(row => row.id)
      : [];

    const crmRoutingRuleIds = dbSchema.crmRoutingRules
      ? (
          await db.query.crmRoutingRules.findMany({
            where: inArray(dbSchema.crmRoutingRules.fallbackAgentId, allUserIds),
            columns: { id: true },
          })
        ).map(row => row.id)
      : [];

    const crmDealFilters = [];
    if (dbSchema.crmDeals) {
      crmDealFilters.push(inArray(dbSchema.crmDeals.agentId, allUserIds));
      if (crmLeadIds.length > 0) {
        crmDealFilters.push(inArray(dbSchema.crmDeals.leadId, crmLeadIds));
      }
    }

    const crmDealIds =
      dbSchema.crmDeals == null || crmDealFilters.length === 0
        ? []
        : (
            await db.query.crmDeals.findMany({
              where: or(...crmDealFilters),
              columns: { id: true },
            })
          ).map(row => row.id);

    const crmTaskIds = dbSchema.crmTasks
      ? (
          await db.query.crmTasks.findMany({
            where: or(
              inArray(dbSchema.crmTasks.assignedActorId, allUserIds),
              inArray(dbSchema.crmTasks.createdById, allUserIds)
            ),
            columns: { id: true },
          })
        ).map(row => row.id)
      : [];

    if (dbSchema.crmTaskHistory) {
      const crmTaskHistoryFilters = [inArray(dbSchema.crmTaskHistory.actorId, allUserIds)];
      if (crmTaskIds.length > 0) {
        crmTaskHistoryFilters.push(inArray(dbSchema.crmTaskHistory.taskId, crmTaskIds));
      }
      await db.delete(dbSchema.crmTaskHistory).where(or(...crmTaskHistoryFilters));
    }

    if (dbSchema.crmTasks && crmTaskIds.length > 0) {
      await db.delete(dbSchema.crmTasks).where(inArray(dbSchema.crmTasks.id, crmTaskIds));
    }

    if (dbSchema.crmActivities) {
      const crmActivityFilters = [inArray(dbSchema.crmActivities.agentId, allUserIds)];
      if (crmLeadIds.length > 0) {
        crmActivityFilters.push(inArray(dbSchema.crmActivities.leadId, crmLeadIds));
      }
      await db.delete(dbSchema.crmActivities).where(or(...crmActivityFilters));
    }

    if (dbSchema.crmRoutingAssignmentsAudit) {
      const crmRoutingAuditFilters = [
        inArray(dbSchema.crmRoutingAssignmentsAudit.actorId, allUserIds),
        inArray(dbSchema.crmRoutingAssignmentsAudit.selectedAgentId, allUserIds),
      ];
      if (crmLeadIds.length > 0) {
        crmRoutingAuditFilters.push(
          inArray(dbSchema.crmRoutingAssignmentsAudit.leadId, crmLeadIds)
        );
      }
      if (crmRoutingRuleIds.length > 0) {
        crmRoutingAuditFilters.push(
          inArray(dbSchema.crmRoutingAssignmentsAudit.ruleId, crmRoutingRuleIds)
        );
      }
      await db.delete(dbSchema.crmRoutingAssignmentsAudit).where(or(...crmRoutingAuditFilters));
    }

    if (dbSchema.crmRoutingCursors && crmRoutingRuleIds.length > 0) {
      await db
        .delete(dbSchema.crmRoutingCursors)
        .where(inArray(dbSchema.crmRoutingCursors.ruleId, crmRoutingRuleIds));
    }

    if (dbSchema.crmRoutingRules && crmRoutingRuleIds.length > 0) {
      await db
        .delete(dbSchema.crmRoutingRules)
        .where(inArray(dbSchema.crmRoutingRules.id, crmRoutingRuleIds));
    }

    if (dbSchema.crmDealBackfillQuarantine && crmDealIds.length > 0) {
      await db
        .delete(dbSchema.crmDealBackfillQuarantine)
        .where(inArray(dbSchema.crmDealBackfillQuarantine.dealId, crmDealIds));
    }

    if (dbSchema.crmDealStageHistory) {
      const crmDealStageHistoryFilters = [
        inArray(dbSchema.crmDealStageHistory.actorId, allUserIds),
      ];
      if (crmDealIds.length > 0) {
        crmDealStageHistoryFilters.push(inArray(dbSchema.crmDealStageHistory.dealId, crmDealIds));
      }
      await db.delete(dbSchema.crmDealStageHistory).where(or(...crmDealStageHistoryFilters));
    }

    if (dbSchema.crmDeals) {
      await db
        .update(dbSchema.crmDeals)
        .set({ archivedById: null })
        .where(inArray(dbSchema.crmDeals.archivedById, allUserIds));
      if (crmDealIds.length > 0) {
        await db.delete(dbSchema.crmDeals).where(inArray(dbSchema.crmDeals.id, crmDealIds));
      }
    }

    if (dbSchema.crmLeadStageHistory) {
      const crmLeadStageHistoryFilters = [
        inArray(dbSchema.crmLeadStageHistory.changedById, allUserIds),
      ];
      if (crmLeadIds.length > 0) {
        crmLeadStageHistoryFilters.push(inArray(dbSchema.crmLeadStageHistory.leadId, crmLeadIds));
      }
      await db.delete(dbSchema.crmLeadStageHistory).where(or(...crmLeadStageHistoryFilters));
    }

    if (dbSchema.crmLeadOwnershipHistory) {
      const crmLeadOwnershipHistoryFilters = [
        inArray(dbSchema.crmLeadOwnershipHistory.agentId, allUserIds),
        inArray(dbSchema.crmLeadOwnershipHistory.changedById, allUserIds),
      ];
      if (crmLeadIds.length > 0) {
        crmLeadOwnershipHistoryFilters.push(
          inArray(dbSchema.crmLeadOwnershipHistory.leadId, crmLeadIds)
        );
      }
      await db
        .delete(dbSchema.crmLeadOwnershipHistory)
        .where(or(...crmLeadOwnershipHistoryFilters));
    }

    if (dbSchema.crmLeads && crmLeadIds.length > 0) {
      await db.delete(dbSchema.crmLeads).where(inArray(dbSchema.crmLeads.id, crmLeadIds));
    }

    if (dbSchema.memberActivities) {
      await db
        .delete(dbSchema.memberActivities)
        .where(
          or(
            inArray(dbSchema.memberActivities.agentId, allUserIds),
            inArray(dbSchema.memberActivities.memberId, allUserIds)
          )
        );
    }

    if (dbSchema.crmPipelineSnapshots) {
      await db
        .delete(dbSchema.crmPipelineSnapshots)
        .where(inArray(dbSchema.crmPipelineSnapshots.createdById, allUserIds));
    }

    if (dbSchema.crmPipelines) {
      await db
        .update(dbSchema.crmPipelines)
        .set({ archivedById: null })
        .where(inArray(dbSchema.crmPipelines.archivedById, allUserIds));
    }

    if (dbSchema.crmPipelineStages) {
      await db
        .update(dbSchema.crmPipelineStages)
        .set({ archivedById: null })
        .where(inArray(dbSchema.crmPipelineStages.archivedById, allUserIds));
    }

    if (dbSchema.crmLossReasons) {
      await db
        .update(dbSchema.crmLossReasons)
        .set({ archivedById: null })
        .where(inArray(dbSchema.crmLossReasons.archivedById, allUserIds));
    }

    // Helper for batching if needed, but for seeds 100-200 is fine in one IN clause usually.
    // 1. Identify and Clean up Claims linked to these users.
    // We must delete claims where these users appear as claimant (userId) OR staff/assigner,
    // otherwise FK constraints can block user deletion during deterministic reset.
    const userClaimIds = await db.query.claims.findMany({
      where: or(
        inArray(dbSchema.claims.userId, allUserIds),
        inArray(dbSchema.claims.staffId, allUserIds),
        inArray(dbSchema.claims.assignedById, allUserIds),
        inArray(dbSchema.claims.agentId, allUserIds)
      ),
      columns: { id: true },
    });

    const cIds = userClaimIds.map(c => c.id);
    if (cIds.length > 0) {
      if (dbSchema.supportHandoffs) {
        await db
          .delete(dbSchema.supportHandoffs)
          .where(inArray(dbSchema.supportHandoffs.claimId, cIds));
      }
      if (dbSchema.claimEscalationAgreements) {
        await db
          .delete(dbSchema.claimEscalationAgreements)
          .where(inArray(dbSchema.claimEscalationAgreements.claimId, cIds));
      }
      if (dbSchema.claimTrackingTokens) {
        await db
          .delete(dbSchema.claimTrackingTokens)
          .where(inArray(dbSchema.claimTrackingTokens.claimId, cIds));
      }
      // Manual cascade: claim_threads has FK -> claim with ON DELETE NO ACTION.
      if (dbSchema.claimThreads) {
        await db.delete(dbSchema.claimThreads).where(inArray(dbSchema.claimThreads.claimId, cIds));
      }
      await db
        .delete(dbSchema.claimDocuments)
        .where(inArray(dbSchema.claimDocuments.claimId, cIds));
      await db.delete(dbSchema.claimMessages).where(inArray(dbSchema.claimMessages.claimId, cIds));
      await db
        .delete(dbSchema.claimStageHistory)
        .where(inArray(dbSchema.claimStageHistory.claimId, cIds));
    }

    await db
      .delete(dbSchema.claims)
      .where(
        or(
          inArray(dbSchema.claims.userId, allUserIds),
          inArray(dbSchema.claims.staffId, allUserIds),
          inArray(dbSchema.claims.assignedById, allUserIds),
          inArray(dbSchema.claims.agentId, allUserIds)
        )
      );

    // 2. Delete Accounts & Sessions
    await db.delete(dbSchema.account).where(inArray(dbSchema.account.userId, allUserIds));
    await db.delete(dbSchema.session).where(inArray(dbSchema.session.userId, allUserIds));

    // 3. Delete Subscriptions & Cards (by userId) - Delete cards/commissions first
    // Delete Agent Commissions linked to these users' subscriptions
    const subIds = await db.query.subscriptions.findMany({
      where: inArray(dbSchema.subscriptions.userId, allUserIds),
      columns: { id: true },
    });
    if (subIds.length > 0) {
      await db.delete(dbSchema.agentCommissions).where(
        inArray(
          dbSchema.agentCommissions.subscriptionId,
          subIds.map(s => s.id)
        )
      );
    }

    await db
      .delete(dbSchema.membershipCards)
      .where(inArray(dbSchema.membershipCards.userId, allUserIds));
    await db
      .delete(dbSchema.subscriptions)
      .where(inArray(dbSchema.subscriptions.userId, allUserIds));

    // 4. Delete Agent Commissions/Clients (if any)
    await db
      .delete(dbSchema.agentClients)
      .where(inArray(dbSchema.agentClients.memberId, allUserIds));
    await db
      .delete(dbSchema.agentClients)
      .where(inArray(dbSchema.agentClients.agentId, allUserIds));

    // 5. Delete Member Leads (if agentId matches) - Optional/Risky if shared, but for goldens it's fine
    // await db.delete(dbSchema.memberLeads).where(inArray(dbSchema.memberLeads.agentId, allUserIds));

    // 6. Detach Agents from Subscriptions (Set agentId to NULL)
    // This prevents FK violation when deleting an agent user who is assigned to a subscription
    // that isn't being deleted (though ideally members are deleted too).
    await db
      .update(dbSchema.subscriptions)
      .set({ agentId: null })
      .where(inArray(dbSchema.subscriptions.agentId, allUserIds));

    // 7. Delete Agents' Leads (cannot set agentId null)
    const agentLeadIds = await db.query.memberLeads.findMany({
      where: inArray(dbSchema.memberLeads.agentId, allUserIds),
      columns: { id: true },
    });

    if (agentLeadIds.length > 0) {
      // Delete payments for these leads first
      await db.delete(dbSchema.leadPaymentAttempts).where(
        inArray(
          dbSchema.leadPaymentAttempts.leadId,
          agentLeadIds.map(l => l.id)
        )
      );
      // Delete the leads
      await db.delete(dbSchema.memberLeads).where(
        inArray(
          dbSchema.memberLeads.id,
          agentLeadIds.map(l => l.id)
        )
      );
    }

    // 7b. Delete Lead Payment Attempts verified by these users
    // This handles the "verified_by_user_id_fk" constraint
    await db
      .delete(dbSchema.leadPaymentAttempts)
      .where(inArray(dbSchema.leadPaymentAttempts.verifiedBy, allUserIds));

    // 7c. Delete Member Notes (authored by these users)
    // authorId does not cascade, so we must delete these notes manually
    await db.delete(dbSchema.memberNotes).where(inArray(dbSchema.memberNotes.authorId, allUserIds));

    // 7d. Delete Audit Logs (performed by these users)
    await db.delete(dbSchema.auditLog).where(inArray(dbSchema.auditLog.actorId, allUserIds));

    // 7d1. Delete Email Campaign Logs for these users
    // email_campaign_logs.user_id does not cascade; deterministic reseeds must remove
    // these rows before deleting seeded users.
    if (dbSchema.emailCampaignLogs) {
      await db
        .delete(dbSchema.emailCampaignLogs)
        .where(inArray(dbSchema.emailCampaignLogs.userId, allUserIds));
    }

    // 7d2. Delete Share Packs created/revoked by these users
    // share_packs.created_by_user_id does not cascade; without this, user deletion can fail.
    if (dbSchema.sharePacks) {
      await db
        .delete(dbSchema.sharePacks)
        .where(
          or(
            inArray(dbSchema.sharePacks.createdByUserId, allUserIds),
            inArray(dbSchema.sharePacks.revokedByUserId, allUserIds)
          )
        );
    }

    // 7e. Delete Documents uploaded by these users.
    // AI provenance tables reference documents with ON DELETE NO ACTION, so they must be
    // cleaned up before deleting the document rows themselves.
    const docIds =
      dbSchema.documents == null
        ? []
        : (
            await db
              .select({ id: dbSchema.documents.id })
              .from(dbSchema.documents)
              .where(inArray(dbSchema.documents.uploadedBy, allUserIds))
          ).map(d => d.id);

    const aiRunFilters = [];
    if (docIds.length > 0 && dbSchema.aiRuns) {
      aiRunFilters.push(inArray(dbSchema.aiRuns.documentId, docIds));
    }
    if (dbSchema.aiRuns) {
      aiRunFilters.push(inArray(dbSchema.aiRuns.requestedBy, allUserIds));
      aiRunFilters.push(inArray(dbSchema.aiRuns.reviewedBy, allUserIds));
    }

    const aiRunIds =
      dbSchema.aiRuns == null || aiRunFilters.length === 0
        ? []
        : (
            await db
              .select({ id: dbSchema.aiRuns.id })
              .from(dbSchema.aiRuns)
              .where(or(...aiRunFilters))
          ).map(run => run.id);

    const extractionFilters = [];
    if (docIds.length > 0 && dbSchema.documentExtractions) {
      extractionFilters.push(inArray(dbSchema.documentExtractions.documentId, docIds));
    }
    if (aiRunIds.length > 0 && dbSchema.documentExtractions) {
      extractionFilters.push(inArray(dbSchema.documentExtractions.sourceRunId, aiRunIds));
    }

    if (dbSchema.documentExtractions && extractionFilters.length > 0) {
      await db.delete(dbSchema.documentExtractions).where(or(...extractionFilters));
    }

    if (dbSchema.aiRuns && aiRunIds.length > 0) {
      await db.delete(dbSchema.aiRuns).where(inArray(dbSchema.aiRuns.id, aiRunIds));
    }

    if (dbSchema.documents && docIds.length > 0) {
      if (dbSchema.documentAccessLog) {
        await db
          .delete(dbSchema.documentAccessLog)
          .where(inArray(dbSchema.documentAccessLog.documentId, docIds));
      }
      await db.delete(dbSchema.documents).where(inArray(dbSchema.documents.id, docIds));
    }

    // 7f. Delete Share Packs created by these users
    if (dbSchema.sharePacks) {
      await db
        .delete(dbSchema.sharePacks)
        .where(inArray(dbSchema.sharePacks.createdByUserId, allUserIds));
    }

    // 7g. Delete commercial idempotency rows recorded for these users
    if (dbSchema.commercialActionIdempotency) {
      await db
        .delete(dbSchema.commercialActionIdempotency)
        .where(inArray(dbSchema.commercialActionIdempotency.actorUserId, allUserIds));
    }

    // Finally delete the users
    await db.delete(dbSchema.user).where(inArray(dbSchema.user.id, allUserIds));
  }

  console.log('✨ Cleanup complete.');
}
