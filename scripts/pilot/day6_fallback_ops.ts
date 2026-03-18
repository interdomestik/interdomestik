import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- Day 6: Communications, Fallbacks, And Incident Handling Simulation ---');

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

  const baseDate = '2026-03-23';
  const formatTime = (hour: number, minute: number) => {
    return new Date(
      `${baseDate}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`
    );
  };

  const scenarioClaims = [
    {
      title: 'D6 Standard Auto Intake',
      category: 'vehicle',
      origin: 'portal',
      created: [9, 0],
      triage: [10, 0],
      public: [11, 0],
      status: 'submitted',
    },
    {
      title: 'D6 Assisted Legal Claim',
      category: 'legal',
      origin: 'agent',
      created: [9, 30],
      triage: [10, 30],
      public: [12, 0],
      status: 'submitted',
      hasWhatsapp: true,
    },
    {
      title: 'D6 Triage Health Claim',
      category: 'health',
      origin: 'portal',
      created: [10, 0],
      triage: [11, 0],
      public: [13, 0],
      status: 'verification',
      hasHotline: true,
    },
  ];

  console.log(`\n--- [Creating ${scenarioClaims.length} Claims for Day 6] ---`);

  for (const claimData of scenarioClaims) {
    const claimId = crypto.randomUUID();

    const createdTime = formatTime(claimData.created[0], claimData.created[1]);
    const triageTime = formatTime(claimData.triage[0], claimData.triage[1]);
    const publicTime = formatTime(claimData.public[0], claimData.public[1]);

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
      actorId: member.id,
      isPublic: true,
      createdAt: triageTime,
    });

    // 3. Public Message (Normal)
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      claimId: claimId,
      tenantId: 'tenant_ks',
      senderId: member.id,
      content: `[SYSTEM] Day 6 Fallback audit verified for ${claimData.title}.`,
      isInternal: false,
      createdAt: publicTime,
    });

    // 4. Fallback Additions
    if (claimData.hasWhatsapp) {
      await db.insert(claimMessages).values({
        id: crypto.randomUUID(),
        claimId: claimId,
        tenantId: 'tenant_ks',
        senderId: agent.id,
        content:
          '[WhatsApp Fallback] Client sent evidence photo via WhatsApp, forwarded to Staff internal node.',
        isInternal: true,
        createdAt: publicTime,
      });
      console.log(`✅ [Fallback Sample] WhatsApp Forwarder logged for ${claimId}`);
    }

    if (claimData.hasHotline) {
      await db.insert(claimMessages).values({
        id: crypto.randomUUID(),
        claimId: claimId,
        tenantId: 'tenant_ks',
        senderId: staff.id,
        content:
          '[Hotline Escalation] Member reported delay via Hotline, Staff expedited triage state.',
        isInternal: true,
        createdAt: publicTime,
      });
      console.log(`✅ [Fallback Sample] Hotline Escalation logged for ${claimId}`);
    }

    console.log(`✅ [Created] ${claimData.title} (${claimId})`);
  }

  console.log(`\n🎉 Day 6 Fallback Simulation Loaded.`);
}

main().catch(console.error);
