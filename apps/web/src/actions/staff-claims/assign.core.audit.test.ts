import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  domainAssignClaim: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/staff-claims/assign', () => ({
  assignClaimCore: hoisted.domainAssignClaim,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

import { assignClaimCore } from './assign.core';

describe('staff assign.core audit wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.domainAssignClaim.mockResolvedValue({ success: true });
  });

  it('passes the audit logger into the staff domain assignment mutation', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    const result = await assignClaimCore({
      claimId: 'claim-1',
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
      staffId: 'staff-2',
    });

    expect(result).toEqual({ success: true });
    expect(hoisted.domainAssignClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        requestHeaders,
        staffId: 'staff-2',
      }),
      { logAuditEvent: hoisted.logAuditEvent }
    );
  });
});
