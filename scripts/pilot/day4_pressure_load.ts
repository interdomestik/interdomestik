import {
  insertScenarioClaim,
  loadPilotScenarioContext,
  resolveTimeWindow,
} from './scenario_helpers';

type ScenarioClaim = {
  title: string;
  category: string;
  origin: string;
  status: 'submitted' | 'verification';
  created?: [number, number];
  triage?: [number, number];
  public?: [number, number];
  createdHours?: [number, number];
  triageHours?: [number, number];
  publicHours?: [number, number];
};

function resolveClaimTimes(
  baseDate: string,
  claimData: ScenarioClaim
): {
  createdTime: Date;
  triageTime: Date;
  publicTime: Date;
} {
  const createdWindow = claimData.createdHours ?? claimData.created;
  const triageWindow = claimData.triageHours ?? claimData.triage;
  const publicWindow = claimData.publicHours ?? claimData.public;

  if (!createdWindow || !triageWindow || !publicWindow) {
    throw new Error(`Scenario timing is incomplete for ${claimData.title}`);
  }

  const [createdHour, createdMinute] = createdWindow;
  const [triageHour, triageMinute] = triageWindow;
  const [publicHour, publicMinute] = publicWindow;
  const createdTime = resolveTimeWindow(baseDate, createdHour, createdMinute);
  const triageTime = resolveTimeWindow(baseDate, triageHour, triageMinute);

  return {
    createdTime,
    triageTime,
    publicTime: resolveTimeWindow(baseDate, publicHour, publicMinute),
  };
}

function resolveAssignees(title: string, agentId: string, staffId: string, memberId: string) {
  const isAssisted = title.includes('Assisted');
  const isTriage = title.includes('Triage');

  return {
    agentId: isAssisted ? agentId : null,
    staffId: isTriage ? staffId : null,
    changedById: isTriage ? staffId : memberId,
    changedByRole: isTriage ? 'staff' : 'member',
    senderId: title.includes('Staff') ? staffId : memberId,
  };
}

async function main() {
  console.log('--- Day 4: SLA Pressure And Queue Load Simulation ---');

  const context = await loadPilotScenarioContext();
  const {
    operatorIds: { agentId, memberId, staffId },
  } = context;

  const baseDate = '2026-03-21';

  const scenarioClaims: ScenarioClaim[] = [
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
    const { createdTime, triageTime, publicTime } = resolveClaimTimes(baseDate, claimData);
    const assignees = resolveAssignees(claimData.title, agentId, staffId, memberId);

    const claimId = await insertScenarioClaim(context, {
      title: claimData.title,
      category: claimData.category,
      origin: claimData.origin,
      status: claimData.status,
      createdAt: createdTime,
      userId: memberId,
      agentId: assignees.agentId,
      staffId: assignees.staffId,
      stage: {
        fromStatus: 'draft',
        toStatus: claimData.status,
        changedById: assignees.changedById,
        changedByRole: assignees.changedByRole,
        note: `Day 4 pressure-load triage update recorded for ${claimData.title}.`,
        createdAt: triageTime,
      },
      messages: [
        {
          senderId: assignees.senderId,
          content: `[SYSTEM] Day 4 Pressure Load audit verified for ${claimData.title}.`,
          createdAt: publicTime,
        },
      ],
    });

    console.log(`✅ [Created] ${claimData.title} (${claimId}) at ${createdTime.toISOString()}`);
  }

  console.log(`\n🎉 Day 4 Pressure Load Simulation Loaded.`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
