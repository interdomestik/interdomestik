import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- Day 3: Closed-Loop Live Role Flow Simulation ---');

  // Dynamically import database modules
  const { db } = await import('@interdomestik/database');
  const { claims, claimStageHistory, claimMessages } =
    await import('@interdomestik/database/schema/claims');
  const { user } = await import('@interdomestik/database/schema/auth');

  // 1. Verify Operators
  const agent = await db.query.user.findFirst({
    where: eq(user.email, 'agent.ks.a1@interdomestik.com'),
  });
  const member = await db.query.user.findFirst({
    where: eq(user.email, 'member.ks.a1@interdomestik.com'),
  });
  const staff = await db.query.user.findFirst({
    where: eq(user.email, 'staff.ks.extra@interdomestik.com'),
  });

  if (!agent || !member || !staff) {
    console.error('❌ Error: Could not find all operation handles (agent, member, staff)');
    process.exit(1);
  }

  console.log(
    `✅ Operators Resolved:\n - Member: ${member.id}\n - Agent: ${agent.id}\n - Staff: ${staff.id}`
  );

  // Base Timestamps for simulation Day 3 (2026-03-20)
  const baseDate = '2026-03-20';

  const formatTime = (hour: number, minute: number) => {
    return new Date(
      `${baseDate}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`
    );
  };

  const scenarioClaims = [
    {
      title: 'Day 3 Standard Auto Intake',
      category: 'vehicle',
      origin: 'portal',
      agentId: null,
      staffId: null,
      createdHours: [9, 0],
      triageHours: [10, 0],
      publicHours: [11, 0],
      status: 'submitted',
    },
    {
      title: 'Day 3 Assisted Legal Claim',
      category: 'legal',
      origin: 'agent',
      agentId: agent.id,
      staffId: null,
      createdHours: [9, 15],
      triageHours: [10, 15],
      publicHours: [12, 15],
      status: 'submitted',
    },
    {
      title: 'Day 3 Triage Health Review',
      category: 'health',
      origin: 'portal',
      agentId: null,
      staffId: staff.id,
      createdHours: [9, 30],
      triageHours: [10, 30],
      publicHours: [13, 0],
      status: 'verification',
    },
    {
      title: 'Day 3 Triage General Review',
      category: 'vehicle',
      origin: 'portal',
      agentId: null,
      staffId: staff.id,
      createdHours: [9, 45],
      triageHours: [11, 0],
      publicHours: [14, 0],
      status: 'verification',
    },
  ];

  console.log(`\n--- [Creating ${scenarioClaims.length} Closed-Loop Claims] ---`);

  for (const claimData of scenarioClaims) {
    const claimId = crypto.randomUUID();
    const createdTime = formatTime(claimData.createdHours[0], claimData.createdHours[1]);
    const triageTime = formatTime(claimData.triageHours[0], claimData.triageHours[1]);
    const publicTime = formatTime(claimData.publicHours[0], claimData.publicHours[1]);
    let changedByRole: 'staff' | 'agent' | 'member' = 'member';

    if (claimData.staffId) {
      changedByRole = 'staff';
    } else if (claimData.agentId) {
      changedByRole = 'agent';
    }

    console.log(`[Debug] Inserting claim ${claimData.title}...`);
    // 1. Intake creation
    await db.insert(claims).values({
      id: claimId,
      tenantId: 'tenant_ks',
      title: claimData.title,
      companyName: 'SIGAL UNIQA Group Austria',
      userId: member.id,
      agentId: claimData.agentId,
      staffId: claimData.staffId,
      category: claimData.category,
      status: claimData.status,
      origin: claimData.origin as any,
      createdAt: createdTime,
      updatedAt: createdTime,
    });

    console.log(`[Debug] Inserting stage history...`);
    // 2. Triage Update (Same Day within 4h SLA)
    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      claimId: claimId,
      tenantId: 'tenant_ks',
      fromStatus: 'draft',
      toStatus: claimData.status,
      changedById: claimData.staffId || claimData.agentId || member.id,
      changedByRole,
      note: `Day 3 triage update recorded for ${claimData.title}.`,
      isPublic: true,
      createdAt: triageTime,
    });

    console.log(`✅ [Created] ${claimData.title} (${claimId}) at ${createdTime.toISOString()}`);
    console.log(`✅ [Triaged] ${claimData.title} at ${triageTime.toISOString()}`);

    console.log(`[Debug] Inserting message...`);
    // 3. Public Message (Same Day within 24h SLA)
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      claimId: claimId,
      tenantId: 'tenant_ks',
      senderId: claimData.staffId || claimData.agentId || member.id,
      content: `[SYSTEM] Day 3 Closed-Loop message update verified for ${claimData.title}.`,
      createdAt: publicTime,
    });

    console.log(`✅ [Public Update] ${claimData.title} at ${publicTime.toISOString()}`);
  }

  console.log('\n--- [Simulation Verification] ---');
  console.log(`🎉 Day 3 Closed-Loop Simulation Completed for ${scenarioClaims.length} Claims.`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
