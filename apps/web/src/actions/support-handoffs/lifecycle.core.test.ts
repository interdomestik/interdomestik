import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  close: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/lifecycle', () => ({
  acceptSupportHandoffCore: vi.fn(),
  closeSupportHandoffCore: mocks.close,
  reassignSupportHandoffCore: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock('@/lib/notifications', () => ({
  clearSupportHandoffPublicResponseNotifications: mocks.clear,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { closeSupportHandoffCore } from './lifecycle.core';

const authority = mintTestTenantAuthority('tenant-1');
const session = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
} as Parameters<typeof closeSupportHandoffCore>[0]['session'];

describe('closeSupportHandoffCore web action wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clear.mockResolvedValue({ success: true });
  });

  it('clears the member notification under the same session authority the close ran under', async () => {
    mocks.close.mockResolvedValue({
      success: true,
      data: { handoffId: 'handoff-1', memberId: 'member-1', tenantId: 'tenant-1' },
    });

    await closeSupportHandoffCore({ authority, handoffId: 'handoff-1', reason: 'done', session });

    expect(mocks.close.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.clear.mock.calls[0]![2].authority).toBe(authority);
  });

  it('touches neither notifications nor caches when the domain refuses', async () => {
    mocks.close.mockResolvedValue({ success: false, error: 'Unauthorized' });

    await closeSupportHandoffCore({
      authority: null,
      handoffId: 'handoff-1',
      reason: 'done',
      session: null,
    });

    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
