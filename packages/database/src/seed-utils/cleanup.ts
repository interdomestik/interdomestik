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

  // 1. Delete Claims and related children
  // (Assuming cascade delete might handle some, but explicit is safer for seeds)
  // Deleting claims by ID prefix
  await db.delete(dbSchema.claims).where(or(...likePatterns.map(p => like(dbSchema.claims.id, p))));

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

    // Helper for batching if needed, but for seeds 100-200 is fine in one IN clause usually.
    // 1. Delete Claims by User ID
    await db.delete(dbSchema.claims).where(inArray(dbSchema.claims.userId, allUserIds));

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

    // Finally delete the users
    await db.delete(dbSchema.user).where(inArray(dbSchema.user.id, allUserIds));
  }

  console.log('✨ Cleanup complete.');
}
