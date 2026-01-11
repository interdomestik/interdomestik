import { inArray, like, or } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';

export async function clearData() {
  console.log('🧹 Cleaning up old Full Seed data...');

  const usersToDelete = await db.query.user.findMany({
    where: (users, { like }) => like(users.id, 'full_%'),
    columns: { id: true },
  });

  // Also include explicitly defined seed users (including golden ones if we want to reset them,
  // but let's stick to full_* prefix clearing OR explicit IDs from our list to be safe).
  // Actually, 'golden_*' users should technically persist or be managed by golden seed.
  // But if we are re-seeding them here, we might want to ensure they are clean.
  // However, the rule is "Do NOT wipe non-full records".
  // So we ONLY wipe 'full_%'.
  // BUT what about the 'golden_' users we are upserting?
  // We leave them be and depend on onConflictDoUpdate.

  const ids = usersToDelete.map(u => u.id);

  if (ids.length > 0) {
    console.log(`Found ${ids.length} 'full_*' users to clean up.`);

    // Delete dependent tables first (reverse FK order)
    // 1. Claims & related
    const claims = await db.query.claims.findMany({
      where: inArray(schema.claims.userId, ids),
      columns: { id: true },
    });
    const claimIds = claims.map(c => c.id);
    if (claimIds.length > 0) {
      await db.delete(schema.claimMessages).where(inArray(schema.claimMessages.claimId, claimIds));
      await db
        .delete(schema.claimDocuments)
        .where(inArray(schema.claimDocuments.claimId, claimIds));
      await db
        .delete(schema.claimStageHistory)
        .where(inArray(schema.claimStageHistory.claimId, claimIds));
      await db.delete(schema.claims).where(inArray(schema.claims.id, claimIds));
    }

    // 2. Subscriptions & Billing & Commissions
    // Delete commissions first as they depend on subscriptions
    await db.delete(schema.agentCommissions).where(inArray(schema.agentCommissions.memberId, ids));
    await db.delete(schema.agentCommissions).where(inArray(schema.agentCommissions.agentId, ids));

    await db.delete(schema.membershipCards).where(inArray(schema.membershipCards.userId, ids));
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.userId, ids));

    // 3. Agent Stuff
    await db.delete(schema.agentClients).where(inArray(schema.agentClients.memberId, ids));
    await db.delete(schema.agentClients).where(inArray(schema.agentClients.agentId, ids));

    // 4. Balkan Leads (Agent flow)
    await db.delete(schema.memberLeads).where(inArray(schema.memberLeads.agentId, ids));

    // 5. Auth & Core User
    await db.delete(schema.session).where(inArray(schema.session.userId, ids));
    await db.delete(schema.account).where(inArray(schema.account.userId, ids));
    await db.delete(schema.memberNotes).where(inArray(schema.memberNotes.memberId, ids));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, ids));

    // Finally users
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LEGACY V1 BRANCH CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════════
  // Clean up legacy branches from V1 seeding scripts that used different ID patterns
  // (e.g., branch_mk_a, branch_ks_b) instead of current (mk_branch_a, ks_branch_a)
  console.log('🧹 Cleaning up legacy V1 branches...');

  const legacyBranches = await db.query.branches.findMany({
    where: or(
      like(schema.branches.id, 'branch_%'),
      like(schema.branches.id, 'test_%'),
      like(schema.branches.id, 'manual_%')
    ),
    columns: { id: true },
  });

  if (legacyBranches.length > 0) {
    const legacyBranchIds = legacyBranches.map(b => b.id);
    console.log(`Found ${legacyBranchIds.length} legacy branches to clean up.`);

    // First: Delete branch managers and E2E users tied to legacy branches
    // (check_bm_has_branch constraint prevents setting their branchId to null)
    const bmUsers = await db.query.user.findMany({
      where: (users, { and, inArray, eq, like }) =>
        and(inArray(users.branchId, legacyBranchIds), eq(users.role, 'branch_manager')),
      columns: { id: true },
    });
    const e2eUsers = await db.query.user.findMany({
      where: (users, { like }) => like(users.id, 'e2e-%'),
      columns: { id: true },
    });
    const usersToDelete = [...bmUsers.map(u => u.id), ...e2eUsers.map(u => u.id)];

    if (usersToDelete.length > 0) {
      // Delete ALL dependent data for these legacy users (FK-safe order)
      // 1. Claims & related
      const claims = await db.query.claims.findMany({
        where: inArray(schema.claims.userId, usersToDelete),
        columns: { id: true },
      });
      const claimIds = claims.map(c => c.id);
      if (claimIds.length > 0) {
        await db
          .delete(schema.claimMessages)
          .where(inArray(schema.claimMessages.claimId, claimIds));
        await db
          .delete(schema.claimDocuments)
          .where(inArray(schema.claimDocuments.claimId, claimIds));
        await db
          .delete(schema.claimStageHistory)
          .where(inArray(schema.claimStageHistory.claimId, claimIds));
        await db.delete(schema.claims).where(inArray(schema.claims.id, claimIds));
      }
      // 2. Subscriptions & Billing
      await db
        .delete(schema.agentCommissions)
        .where(inArray(schema.agentCommissions.memberId, usersToDelete));
      await db
        .delete(schema.agentCommissions)
        .where(inArray(schema.agentCommissions.agentId, usersToDelete));
      await db
        .delete(schema.membershipCards)
        .where(inArray(schema.membershipCards.userId, usersToDelete));
      await db
        .delete(schema.subscriptions)
        .where(inArray(schema.subscriptions.userId, usersToDelete));
      // 3. Agent clients
      await db
        .delete(schema.agentClients)
        .where(inArray(schema.agentClients.memberId, usersToDelete));
      await db
        .delete(schema.agentClients)
        .where(inArray(schema.agentClients.agentId, usersToDelete));
      // 4. Leads
      await db.delete(schema.memberLeads).where(inArray(schema.memberLeads.agentId, usersToDelete));
      // 5. Auth & Core
      await db.delete(schema.session).where(inArray(schema.session.userId, usersToDelete));
      await db.delete(schema.account).where(inArray(schema.account.userId, usersToDelete));
      await db
        .delete(schema.memberNotes)
        .where(inArray(schema.memberNotes.memberId, usersToDelete));
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, usersToDelete));
      // Finally users
      await db.delete(schema.user).where(inArray(schema.user.id, usersToDelete));
      console.log(`  ✓ Deleted ${usersToDelete.length} legacy branch managers + E2E users`);
    }

    // Now safe to nullify branchId for remaining users
    await db
      .update(schema.user)
      .set({ branchId: null })
      .where(inArray(schema.user.branchId, legacyBranchIds));

    // Clean up claims tied to legacy branches
    await db
      .update(schema.claims)
      .set({ branchId: null })
      .where(inArray(schema.claims.branchId, legacyBranchIds));

    // Clean up leads tied to legacy branches - nullify branchId
    for (const branchId of legacyBranchIds) {
      await db.execute(
        `UPDATE member_leads SET branch_id = NULL WHERE branch_id = '${branchId}'` as unknown as Parameters<
          typeof db.execute
        >[0]
      );
    }

    // Clean up subscriptions tied to legacy branches - nullify branchId
    for (const branchId of legacyBranchIds) {
      await db.execute(
        `UPDATE subscriptions SET branch_id = NULL WHERE branch_id = '${branchId}'` as unknown as Parameters<
          typeof db.execute
        >[0]
      );
    }

    // Delete the legacy branches
    await db.delete(schema.branches).where(inArray(schema.branches.id, legacyBranchIds));
    console.log(`  ✓ Deleted ${legacyBranchIds.length} legacy branches`);
  }
}
