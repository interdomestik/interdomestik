export function wireRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    claimNumber: 'C-1001',
    title: 'Flight Delay',
    status: 'submitted',
    statusLabelKey: 'status.submitted',
    currentStage: 'submitted',
    currentOwnerRole: 'staff',
    isStuck: false,
    daysInCurrentStage: 1,
    claimantName: 'Jane Doe',
    claimantEmail: 'jane@example.com',
    branchId: 'branch-1',
    branchCode: 'BR1',
    branchName: 'Branch One',
    staffName: null,
    staffEmail: null,
    assignedAt: null,
    amount: '1200.00',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    unreadCount: 2,
    category: 'travel',
    ...overrides,
  };
}

export function wireResponse(rows: Array<Record<string, unknown>>) {
  return {
    success: true,
    claims: rows,
    page: 1,
    perPage: 10,
    totalCount: rows.length,
    totalPages: 1,
    totals: { active: rows.length, draft: 0, closed: 0 },
  };
}
