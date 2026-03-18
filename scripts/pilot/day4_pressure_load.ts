import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- Day 4: SLA Pressure And Queue Load Simulation ---');

  const { db } = await import('@interdomestik/database');
  const { claims, claimStageHistory, claimMessages } =
    await import('@interdomestik/database/schema/claims');
  const { user } = await import('@interdomestik/database/schema/auth');

  // Verify Operators
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

  const baseDate = '2026-03-21';

  const formatTime = (hour: number, minute: number) => {
    return new Date(
      `${baseDate}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`
    );
  };

  const scenarioClaims = [
    {
      title: 'D4 Standard Auto Intake 1',
      category: 'vehicle',
      origin: 'portal',
      created: [9, 0],
      triage: [10, 0],
      public: [11, 0],
      status: 'submitted',
    },
    {
      title: 'D4 Standard Auto Intake 2',
      category: 'vehicle',
      origin: 'portal',
      created: [9, 15],
      triage: [10, 15],
      public: [11, 15],
      status: 'submitted',
    },
    {
      title: 'D4 Assisted Legal Claim',
      category: 'legal',
      origin: 'agent',
      created: [9, 30],
      triage: [10, 30],
      public: [12, 0],
      status: 'submitted',
    },
    {
      title: 'D4 Staff Triage Health 1',
      category: 'health',
      origin: 'portal',
      created: [9, 45],
      triage: [11, 0],
      public: [13, 0],
      status: 'verification',
    },
    {
      title: 'D4 Staff Triage General 2',
      category: 'vehicle',
      origin: 'portal',
      created: [10, 0],
      triage: [11, 30],
      public: [14, 0],
      status: 'verification',
    },
    {
      title: 'D4 SLA BREACH - Triage Tardy',
      category: 'legal',
      origin: 'portal',
      created: [0, 1], // Wait, let's just make creation Hour 09:00, Triage 13:30 (4.5h delay)
      createdHours: [9, 0],
      triageHours: [13, 30], // Boundary Breach (>4h)
      publicHours: [14, 30],
      status: 'submitted',
    },
    {
      title: 'D4 SLA BREACH - Public Update Tardy',
      category: 'vehicle',
      origin: 'portal',
      createdHours: [9, 0],
      triageHours: [10, 0],
      publicHours: [35, 0], // Simulates 25-26h gap for update, though Date format math is easier with offsets.
      status: 'submitted',
    },
  ];

  console.log(`\n--- [Creating ${scenarioClaims.length} Claims under SLA Pressure] ---`);

  for (const claimData of scenarioClaims) {
    const claimId = crypto.randomUUID();

    // Resolve Hours with defaults if explicitly listed in Hours arrays.
    const cH = claimData.createdHours ? claimData.createdHours[0] : (claimData as any).created[0];
    const cM = claimData.createdHours ? claimData.createdHours[1] : (claimData as any).created[1];
    const tH = claimData.triageHours ? claimData.triageHours[0] : (claimData as any).triage[0];
    const tM = claimData.triageHours ? claimData.triageHours[1] : (claimData as any).triage[1];
    const pH = claimData.publicHours ? claimData.publicHours[0] : (claimData as any).public[0];
    const pM = claimData.publicHours ? claimData.publicHours[1] : (claimData as any).public[1];

    const createdTime = formatTime(cH, cM);
    const triageTime = formatTime(tH, tM);

    // For Breach simulating >24h, offset date to 2026-03-22 if pH > 23
    let publicTime = formatTime(pH > 23 ? pH - 24 : pH, pM);
    if (pH > 23) {
      publicTime = new Date(
        `2026-03-22T${(pH - 24).toString().padStart(2, '0')}:${pM.toString().padStart(2, '0')}:00Z`
      );
    }

    // 1. Intake creation
    await db.insert(claims).values({
      id: claimId,
      tenantId: 'tenant_ks',
      title: claimData.title,
      companyName: 'SIGAL UNIQA Group Austria',
      userId: member.id,
      agentId: claimData.title.includes('Assisted') ? agent.id : null,
      staffId: claimData.title.includes('Triage') ? staff.id : null,
      category: claimData.category,
      status: claimData.status,
      origin: claimData.origin as any,
      createdAt: createdTime,
      updatedAt: createdTime,
    });

    // 2. Triage Update
    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      claimId: claimId,
      tenantId: 'tenant_ks',
      fromStatus: 'draft',
      toStatus: claimData.status,
      actorId: claimData.title.includes('Triage') ? staff.id : member.id,
      isPublic: true,
      createdAt: triageTime,
    });

    // 3. Public Message
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      claimId: claimId,
      tenantId: 'tenant_ks',
      senderId: claimData.title.includes('Staff') ? staff.id : member.id,
      content: `[SYSTEM] Day 4 Pressure Load audit verified for ${claimData.title}.`,
      createdAt: publicTime,
    });

    console.log(`✅ [Created] ${claimData.title} (${claimId}) at ${createdTime.toISOString()}`);
  }

  console.log(`\n🎉 Day 4 Pressure Load Simulation Loaded.`);
}

main().catch(console.error);
