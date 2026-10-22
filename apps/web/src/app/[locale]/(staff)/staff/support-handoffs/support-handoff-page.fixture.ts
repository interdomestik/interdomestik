export const queueItem = {
  claim: {
    claimNumber: 'CLM-1',
    id: 'claim-1',
    status: 'submitted',
    title: 'Claim one',
  },
  createdAt: '2026-05-03T10:00:00.000Z',
  id: 'handoff-1',
  lifecycleVersion: 4,
  member: {
    email: 'member@example.com',
    id: 'member-1',
    memberNumber: 'MEM-1',
    name: 'Member One',
  },
  message: 'The member needs staff support.',
  needsFollowUp: false,
  publicResponseAt: null,
  relationship: {
    agentName: 'Agent One',
    branchName: 'Prishtina',
    membershipStatus: 'active',
    planName: 'Family',
  },
  staffId: null,
  staffName: null,
  status: 'open',
  subject: 'Help with submitted claim',
  trustRisk: 'high',
  updatedAt: '2026-05-03T10:00:00.000Z',
  urgency: 'critical',
} as const;

export function session(role: 'staff' | 'branch_manager' = 'staff') {
  return {
    user: {
      branchId: 'branch-1',
      id: role === 'staff' ? 'staff-1' : 'manager-1',
      role,
      tenantId: 'tenant-1',
    },
  };
}
