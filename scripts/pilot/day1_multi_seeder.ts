import {
  claims,
  claimMessages,
  claimStageHistory,
  notifications,
  emailCampaignLogs,
  db,
  eq,
  user,
} from '@interdomestik/database';
import crypto from 'node:crypto';

async function main() {
  console.log('[Seeder] Connecting to Database...');

  const agentEmail = 'agent.ks.a1@interdomestik.com';
  const memberEmail = 'member.ks.a1@interdomestik.com';
  const staffEmail = 'staff.ks.extra@interdomestik.com';

  const agent = await db.query.user.findFirst({ where: eq(user.email, agentEmail) });
  const member = await db.query.user.findFirst({ where: eq(user.email, memberEmail) });
  const staff = await db.query.user.findFirst({ where: eq(user.email, staffEmail) });

  if (!agent || !member || !staff) {
    throw new Error('Could not find all required users (Agent, Member, Staff)');
  }

  console.log(
    `[Seeder] Resolved Users:\n - Member: ${member.id}\n - Agent: ${agent.id}\n - Staff: ${staff.id}`
  );

  const tenantId = 'tenant_ks';
  const claimCount = 5;
  const targetClaims: any[] = [];

  console.log(`[Seeder] Creating ${claimCount} Claims with title watermark 'Live Pilot Run 2'...`);

  for (let i = 1; i <= claimCount; i++) {
    const claimId = crypto.randomUUID();
    const isAgentAssisted = i === 1; // Make 1st claim agent-assisted

    await db.insert(claims).values({
      id: claimId,
      tenantId,
      userId: member.id,
      agentId: isAgentAssisted ? agent.id : null,
      title: `Live Pilot Run 2 Claim #${i} - ${new Date().toLocaleTimeString('en-US', { hour12: false })}`,
      category: 'vehicle',
      companyName: 'SIGAL UNIQA Group Austria',
      origin: isAgentAssisted ? 'agent' : 'portal',
      status: 'submitted',
      createdAt: new Date(),
    });

    targetClaims.push({ id: claimId, title: `Live Pilot Run 2 Claim #${i}` });

    // 📩 In-App Notification for Agent
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      tenantId,
      userId: agent.id,
      type: 'claim_update',
      title: 'New Claim Submitted',
      content: `A new claim (${claimId}) has been submitted by ${member.email}.`,
      isRead: false,
      createdAt: new Date(),
    });

    console.log(` ✅ Created Claim #${i} (${claimId})`);
  }

  console.log('[Seeder] Simulating Triage for 2 Claims...');
  const triageClaims = targetClaims.slice(0, 2);

  for (const c of triageClaims) {
    await db
      .update(claims)
      .set({
        staffId: staff.id,
        status: 'verification',
        statusUpdatedAt: new Date(),
      })
      .where(eq(claims.id, c.id));

    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      fromStatus: 'submitted',
      toStatus: 'verification',
      changedById: staff.id,
      changedByRole: 'staff',
      isPublic: true,
      note: 'Staff Triage (Run 2)',
      createdAt: new Date(),
    });

    // 📩 In-App Notification for Member
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      tenantId,
      userId: member.id,
      type: 'claim_update',
      title: 'Claim in Verification',
      content: `Your claim ${c.title} is now under Triage verification.`,
      isRead: false,
      createdAt: new Date(),
    });

    console.log(` ✅ Triaged Claim ${c.id}`);
  }

  console.log('[Seeder] Simulating Multi-User Messages...');

  for (const c of targetClaims) {
    // 1. Agent -> Member Message
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      senderId: agent.id,
      content: `Hello ${member.email}, I am checking up on your claim ${c.title}.`,
      isInternal: false,
      createdAt: new Date(),
    });

    // 2. Staff -> Agent (Internal) Note
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      senderId: staff.id,
      content: `[Internal Note] Processing for ${c.title} is clear to proceed.`,
      isInternal: true,
      createdAt: new Date(),
    });

    console.log(` ✅ Added messages for Claim ${c.id}`);
  }

  console.log('[Seeder] Logging Email Campaigns...');
  await db.insert(emailCampaignLogs).values({
    id: crypto.randomUUID(),
    tenantId,
    userId: member.id,
    campaignId: 'welcome_day_1_run2',
    sentAt: new Date(),
  });

  console.log('🎉 DB Multi Seeder Simulation Finished Successfully!');
}

try {
  await main();
} catch (err) {
  console.error('[Seeder] Error:', err);
  process.exit(1);
}
