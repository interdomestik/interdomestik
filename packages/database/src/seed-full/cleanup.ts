import { inArray } from 'drizzle-orm';
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
}
