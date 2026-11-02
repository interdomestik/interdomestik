import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDomainSupportHandoff: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/create', () => ({
  createMemberSupportHandoffCore: mocks.createDomainSupportHandoff,
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { createMemberSupportHandoffCore } from './create.core';

const authority = mintTestTenantAuthority('tenant-1');
const memberSession = {
  user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
} as Parameters<typeof createMemberSupportHandoffCore>[0]['session'];

describe('createMemberSupportHandoffCore web action wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDomainSupportHandoff.mockResolvedValue({ success: true, data: { id: 'h-1' } });
  });

  it('hands the session authority itself to the domain writer and refreshes both surfaces', async () => {
    const result = await createMemberSupportHandoffCore({
      authority,
      input: { message: 'Please call me.', subject: 'Need help' },
      session: memberSession,
    });

    expect(result).toEqual({ success: true, data: { id: 'h-1' } });
    expect(mocks.createDomainSupportHandoff).toHaveBeenCalledTimes(1);
    const [params, deps] = mocks.createDomainSupportHandoff.mock.calls[0]!;
    expect(params.authority).toBe(authority);
    expect(params.session).toBe(memberSession);
    expect(deps).toEqual({ logAuditEvent: mocks.logAuditEvent });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sq/member/help');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sq/staff/support-handoffs');
  });

  it('passes a missing authority through so the domain refuses, without refreshing caches', async () => {
    mocks.createDomainSupportHandoff.mockResolvedValue({ success: false, error: 'Unauthorized' });

    const result = await createMemberSupportHandoffCore({
      authority: null,
      input: {},
      session: null,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.createDomainSupportHandoff.mock.calls[0]![0].authority).toBeNull();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
