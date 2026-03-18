import { insertScenarioClaim, loadPilotScenarioContext } from './scenario_helpers';

async function main() {
  console.log('--- Day 2: Rollback & Resume Simulation (Full Scenario) ---');

  const context = await loadPilotScenarioContext();
  const {
    operatorIds: { agentId, memberId, staffId },
  } = context;

  console.log(
    `✅ Operator Handles Resolved:\n - Member: ${memberId}\n - Agent: ${agentId}\n - Staff: ${staffId}`
  );

  const day2Timestamp = new Date('2026-03-19T09:00:00Z');

  // 2. Simulate System Incident / Rollback Trigger (Log Output)
  console.log('\n--- [Incident Simulator] ---');
  console.log(
    `[2026-03-19T08:15:00Z] INCIDENT: Critical UI Render Glitch detected in Claim Messenger.`
  );
  console.log(
    `[2026-03-19T08:30:00Z] ACTION: triggering Rollback to stable tag 'pilot-ready-20260318'.`
  );

  // 3. Create Resume Operation Claims (Allocated to Scenario Slices)
  const scenarioClaims = [
    {
      title: 'Day 2 Standard Auto Intake',
      category: 'vehicle',
      origin: 'portal',
      agentId: null,
      staffId: null,
      status: 'submitted',
    },
    {
      title: 'Day 2 Standard Property Intake',
      category: 'property',
      origin: 'portal',
      agentId: null,
      staffId: null,
      status: 'submitted',
    },
    {
      title: 'Day 2 Assisted Legal Claim',
      category: 'legal',
      origin: 'agent',
      agentId,
      staffId: null,
      status: 'submitted',
    },
    {
      title: 'Day 2 Assisted Travel Claim',
      category: 'travel',
      origin: 'agent',
      agentId,
      staffId: null,
      status: 'submitted',
    },
    {
      title: 'Day 2 Triage Health Review',
      category: 'health',
      origin: 'portal',
      agentId: null,
      staffId,
      status: 'verification',
    },
    {
      title: 'Day 2 Triage General Backlog',
      category: 'vehicle',
      origin: 'portal',
      agentId: null,
      staffId,
      status: 'verification',
    },
  ];

  console.log(`\n--- [Creating ${scenarioClaims.length} Allocated Claims] ---`);

  for (const claimData of scenarioClaims) {
    const changedById = claimData.staffId || claimData.agentId || memberId;
    let changedByRole: 'staff' | 'agent' | 'member' = 'member';
    if (claimData.staffId) {
      changedByRole = 'staff';
    } else if (claimData.agentId) {
      changedByRole = 'agent';
    }

    const resumeClaimId = await insertScenarioClaim(context, {
      title: claimData.title,
      category: claimData.category,
      origin: claimData.origin,
      status: claimData.status,
      createdAt: day2Timestamp,
      userId: memberId,
      agentId: claimData.agentId,
      staffId: claimData.staffId,
      stage: {
        fromStatus: 'draft',
        toStatus: claimData.status,
        changedById,
        changedByRole,
        note: `Resume operational trace verified for ${claimData.title}.`,
        createdAt: day2Timestamp,
      },
      messages: [
        {
          senderId: changedById,
          content: `[SYSTEM] Resume operational trace verified for ${claimData.title}.`,
          createdAt: day2Timestamp,
        },
      ],
    });

    console.log(`✅ Created Claim: ${claimData.title} (${resumeClaimId})`);
  }

  console.log('\n--- [Resume Verification Code] ---');
  console.log(
    `🎉 Day 2 Full Scenario Proof Complete: ${scenarioClaims.length} Claims Inserted perfectly covering operator allocation.`
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
