import {
  insertScenarioClaim,
  loadPilotScenarioContext,
  resolveTimeWindow,
} from './scenario_helpers';

async function main() {
  console.log('--- Day 6: Communications, Fallbacks, And Incident Handling Simulation ---');

  const context = await loadPilotScenarioContext();
  const {
    operatorIds: { agentId, memberId, staffId },
  } = context;

  const baseDate = '2026-03-23';

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
    const createdTime = resolveTimeWindow(baseDate, claimData.created[0], claimData.created[1]);
    const triageTime = resolveTimeWindow(baseDate, claimData.triage[0], claimData.triage[1]);
    const publicTime = resolveTimeWindow(baseDate, claimData.public[0], claimData.public[1]);

    const messages = [
      {
        senderId: memberId,
        content: `[SYSTEM] Day 6 Fallback audit verified for ${claimData.title}.`,
        createdAt: publicTime,
      },
    ];

    if (claimData.hasWhatsapp) {
      messages.push({
        senderId: agentId,
        content:
          '[WhatsApp Fallback] Client sent evidence photo via WhatsApp, forwarded to Staff internal node.',
        isInternal: true,
        createdAt: publicTime,
      });
    }

    if (claimData.hasHotline) {
      messages.push({
        senderId: staffId,
        content:
          '[Hotline Escalation] Member reported delay via Hotline, Staff expedited triage state.',
        isInternal: true,
        createdAt: publicTime,
      });
    }

    const claimId = await insertScenarioClaim(context, {
      title: claimData.title,
      category: claimData.category,
      origin: claimData.origin,
      status: claimData.status,
      createdAt: createdTime,
      userId: memberId,
      agentId: claimData.title.includes('Assisted') ? agentId : null,
      staffId: claimData.title.includes('Triage') ? staffId : null,
      stage: {
        fromStatus: 'draft',
        toStatus: claimData.status,
        changedById: memberId,
        changedByRole: 'member',
        note: `Day 6 fallback audit recorded for ${claimData.title}.`,
        createdAt: triageTime,
      },
      messages,
    });

    if (claimData.hasWhatsapp) {
      console.log(`✅ [Fallback Sample] WhatsApp Forwarder logged for ${claimId}`);
    }

    if (claimData.hasHotline) {
      console.log(`✅ [Fallback Sample] Hotline Escalation logged for ${claimId}`);
    }

    console.log(`✅ [Created] ${claimData.title} (${claimId})`);
  }

  console.log(`\n🎉 Day 6 Fallback Simulation Loaded.`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
