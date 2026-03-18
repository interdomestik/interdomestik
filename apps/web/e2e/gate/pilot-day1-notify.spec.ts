import { claimMessages, claims, db, eq, user, desc } from '@interdomestik/database';
import { test } from '@playwright/test';
import crypto from 'node:crypto';

test('Simulate Multi-User Claim Messages (DB Direct)', async () => {
  test.skip(
    !process.env.PILOT_DB_MUTATION_TESTS,
    'Skipping DB mutation gate; set PILOT_DB_MUTATION_TESTS=1 for explicit opt-in.'
  );

  console.log('[Notify] Connecting to Database...');
  const insertedMessageIds: string[] = [];

  // 1. Resolve User IDs
  const memberEmail = 'member.ks.a1@interdomestik.com';
  const agentEmail = 'agent.ks.a1@interdomestik.com';
  const staffEmail = 'staff.ks.extra@interdomestik.com';

  const member = await db.query.user.findFirst({ where: eq(user.email, memberEmail) });
  const agent = await db.query.user.findFirst({ where: eq(user.email, agentEmail) });
  const staff = await db.query.user.findFirst({ where: eq(user.email, staffEmail) });

  if (!member || !agent || !staff) {
    throw new Error('Could not find all required users for messaging injection');
  }

  console.log(
    `[Notify] Users resolved: Member(${member.id}), Agent(${agent.id}), Staff(${staff.id})`
  );

  // 2. Find the last claim for the Member
  const targetClaim = await db.query.claims.findFirst({
    where: eq(claims.userId, member.id),
    orderBy: [desc(claims.createdAt)],
  });

  if (!targetClaim) {
    throw new Error(`No claim found for member ${memberEmail}`);
  }

  console.log(`[Notify] Targeting Claim ID: ${targetClaim.id} ("${targetClaim.title}")`);

  // 3. Inject 3 messages
  console.log('[Notify] Injecting messages...');

  // A. Agent to Member
  const agentMessageId = crypto.randomUUID();
  insertedMessageIds.push(agentMessageId);
  await db.insert(claimMessages).values({
    id: agentMessageId,
    claimId: targetClaim.id,
    senderId: agent.id,
    content:
      'Përshëndetje! Kemi pranuar kërkesën tuaj. Jemi duke përgatitur dosjen e plotë për trajtim.',
    isInternal: false,
    tenantId: targetClaim.tenantId,
  });
  console.log('✅ Agent -> Member Message Injected');

  // B. Staff to Agent (Internal)
  const staffInternalMessageId = crypto.randomUUID();
  insertedMessageIds.push(staffInternalMessageId);
  await db.insert(claimMessages).values({
    id: staffInternalMessageId,
    claimId: targetClaim.id,
    senderId: staff.id,
    content:
      'Përshëndetje koleg! Kjo kërkesë është legjitime dhe voluminoze. Ju lutem vazhdoni me mbledhjen e dëshmive të plota.',
    isInternal: true,
    tenantId: targetClaim.tenantId,
  });
  console.log('✅ Staff -> Agent (Internal) Message Injected');

  // C. Staff to Member (Public)
  const staffPublicMessageId = crypto.randomUUID();
  insertedMessageIds.push(staffPublicMessageId);
  await db.insert(claimMessages).values({
    id: staffPublicMessageId,
    claimId: targetClaim.id,
    senderId: staff.id,
    content:
      'Kërkesa juaj është miratuar për verifikim. Detajet e SLA do të njoftohen së shpejti njoftohuni në portal.',
    isInternal: false,
    tenantId: targetClaim.tenantId,
  });
  console.log('✅ Staff -> Member Message Injected');

  console.log('🎉 DB Messaging Simulation Finished Successfully!');

  for (const messageId of insertedMessageIds) {
    await db.delete(claimMessages).where(eq(claimMessages.id, messageId));
  }
});
