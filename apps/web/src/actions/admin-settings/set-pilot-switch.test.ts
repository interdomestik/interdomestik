import { authorizedSession } from '@/test/safe-action-harness';
import { MissingTenantError } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), transaction: vi.fn(), write: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transaction,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

import { setPilotSwitch } from './set-pilot-switch';

const tenantAdmin = { id: 'tenant-admin', tenantId: 'tenant-b', role: 'tenant_admin' };
const close = {
  key: 'public_intake',
  enabled: false,
  expectedRevision: 0,
  reason: 'Pause public intake',
};

describe('setPilotSwitch action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(tenantAdmin));
    mocks.transaction.mockImplementation(async (_authority, work) => work({}));
    mocks.write.mockResolvedValue({ ok: true });
  });

  it('requires a session with a tenant', async () => {
    mocks.authorize.mockResolvedValueOnce(null);
    expect(await setPilotSwitch(close)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    mocks.authorize.mockRejectedValueOnce(new MissingTenantError());
    expect(await setPilotSwitch(close)).toMatchObject({ success: false, code: 'MISSING_TENANT' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(['member', 'agent', 'staff', 'branch_manager', 'admin'])(
    'refuses %s before opening a transaction',
    async role => {
      mocks.authorize.mockResolvedValue(
        authorizedSession({ ...tenantAdmin, role, branchId: 'branch-b' })
      );
      expect(await setPilotSwitch(close)).toMatchObject({ success: false, code: 'FORBIDDEN' });
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );

  it.each(['actorId', 'role', 'tenantId', 'tenant'])('rejects injected %s', async field => {
    expect(await setPilotSwitch({ ...close, [field]: 'foreign' })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('refuses a tenant admin opening the switch, even with an approval reference', async () => {
    expect(
      await setPilotSwitch({ ...close, enabled: true, approvalReference: 'signed approval' })
    ).toMatchObject({ success: false, code: 'FORBIDDEN' });
  });

  it('requires an approval reference for a super admin opening the switch', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession({ ...tenantAdmin, role: 'super_admin' }));
    expect(await setPilotSwitch({ ...close, enabled: true })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'approval_required',
    });
  });

  it('opens the transaction under the session authority and returns the saved revision', async () => {
    const context = authorizedSession(tenantAdmin);
    const state = { state: 'closed', revision: 1, wellFormed: true };
    mocks.authorize.mockResolvedValue(context);
    mocks.transaction.mockResolvedValue({ ok: true, switch: state });
    expect(await setPilotSwitch(close)).toEqual({ success: true, data: state });
    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith(
      context.authority,
      expect.any(Function)
    );
  });

  it('returns revision conflicts without classifying them as refusals', async () => {
    mocks.transaction.mockResolvedValue({ ok: false, code: 'CONFLICT' });
    expect(await setPilotSwitch(close)).toMatchObject({ success: false, code: 'CONFLICT' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
