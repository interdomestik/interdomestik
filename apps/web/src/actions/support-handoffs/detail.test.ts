import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), metadata: vi.fn(), domain: vi.fn() }));
vi.mock('./context', () => ({ getActionContext: mocks.context }));
vi.mock('@/features/claims/support-handoffs/get-handoff-metadata', () => ({
  getHandoffMetadata: mocks.metadata,
}));
vi.mock('@interdomestik/domain-claims/support-handoffs/queue', () => ({
  getStaffSupportHandoffDetail: mocks.domain,
}));
import { getSupportHandoffDetail } from './detail';
const authority = {};
const session = (role: string) => ({
  user: { id: 'user', tenantId: 'tenant', branchId: 'branch', role },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.metadata.mockResolvedValue({ kind: 'ok', data: [] });
});
describe('support handoff action dispatch', () => {
  it('dispatches exact BM before the frozen content reader', async () => {
    mocks.context.mockResolvedValue({ authority, session: session('branch_manager') });
    expect(await getSupportHandoffDetail('handoff')).toEqual({
      kind: 'metadata',
      result: { kind: 'ok', data: [] },
    });
    expect(mocks.metadata).toHaveBeenCalledExactlyOnceWith({ authority, handoffId: 'handoff' });
    expect(mocks.domain).not.toHaveBeenCalled();
  });
  it('preserves staff content and own existing arguments', async () => {
    mocks.context.mockResolvedValue({ authority, session: session('staff') });
    mocks.domain.mockResolvedValue({ publicResponse: 'CONTENT-SENTINEL' });
    expect(await getSupportHandoffDetail('handoff')).toEqual({
      publicResponse: 'CONTENT-SENTINEL',
    });
    expect(mocks.domain).toHaveBeenCalledExactlyOnceWith({
      authority,
      handoffId: 'handoff',
      staffId: 'user',
      branchId: 'branch',
      viewerRole: 'staff',
    });
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it.each(['tenant_admin', 'admin', 'super_admin', 'member', 'agent', 'global_support', 'auditor'])(
    'keeps %s denied by this staff-only action',
    async role => {
      mocks.context.mockResolvedValue({ authority, session: session(role) });
      expect(await getSupportHandoffDetail('handoff')).toBeNull();
      expect(mocks.domain).not.toHaveBeenCalled();
      expect(mocks.metadata).not.toHaveBeenCalled();
    }
  );
  it('does not read without authority or branch', async () => {
    mocks.context.mockResolvedValue({ authority: null, session: session('branch_manager') });
    expect(await getSupportHandoffDetail('handoff')).toBeNull();
    mocks.context.mockResolvedValue({
      authority,
      session: { user: { ...session('branch_manager').user, branchId: null } },
    });
    expect(await getSupportHandoffDetail('handoff')).toBeNull();
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.domain).not.toHaveBeenCalled();
  });
});
