import {
  insertScenarioClaim,
  loadPilotScenarioContext,
  resolveTimeWindow,
} from './scenario_helpers';

async function main() {
  console.log('--- Day 3: Closed-Loop Live Role Flow Simulation ---');

  const context = await loadPilotScenarioContext();
  const {
    operatorIds: { agentId, memberId, staffId },
  } = context;

  console.log(
    `✅ Operators Resolved:\n - Member: ${memberId}\n - Agent: ${agentId}\n - Staff: ${staffId}`
  );

  // Base Timestamps for simulation Day 3 (2026-03-20)
  const baseDate = '2026-03-20';

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
      agentId,
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
      staffId,
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
      staffId,
      createdHours: [9, 45],
      triageHours: [11, 0],
      publicHours: [14, 0],
      status: 'verification',
    },
  ];

  console.log(`\n--- [Creating ${scenarioClaims.length} Closed-Loop Claims] ---`);

  for (const claimData of scenarioClaims) {
    const createdTime = resolveTimeWindow(
      baseDate,
      claimData.createdHours[0],
      claimData.createdHours[1]
    );
    const triageTime = resolveTimeWindow(
      baseDate,
      claimData.triageHours[0],
      claimData.triageHours[1]
    );
    const publicTime = resolveTimeWindow(
      baseDate,
      claimData.publicHours[0],
      claimData.publicHours[1]
    );
    let changedByRole: 'staff' | 'agent' | 'member' = 'member';

    if (claimData.staffId) {
      changedByRole = 'staff';
    } else if (claimData.agentId) {
      changedByRole = 'agent';
    }

    console.log(`[Debug] Inserting claim ${claimData.title}...`);
    const claimId = await insertScenarioClaim(context, {
      title: claimData.title,
      category: claimData.category,
      origin: claimData.origin,
      status: claimData.status,
      createdAt: createdTime,
      userId: memberId,
      agentId: claimData.agentId,
      staffId: claimData.staffId,
      stage: {
        fromStatus: 'draft',
        toStatus: claimData.status,
        changedById: claimData.staffId || claimData.agentId || memberId,
        changedByRole,
        note: `Day 3 triage update recorded for ${claimData.title}.`,
        createdAt: triageTime,
      },
      messages: [
        {
          senderId: claimData.staffId || claimData.agentId || memberId,
          content: `[SYSTEM] Day 3 Closed-Loop message update verified for ${claimData.title}.`,
          createdAt: publicTime,
        },
      ],
    });

    console.log(`✅ [Created] ${claimData.title} (${claimId}) at ${createdTime.toISOString()}`);
    console.log(`✅ [Triaged] ${claimData.title} at ${triageTime.toISOString()}`);
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
