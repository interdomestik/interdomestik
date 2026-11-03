import { mocks } from './response.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportHandoffSession } from './types';
import { MAX_PUBLIC_RESPONSE_LENGTH } from './types';
import { updateSupportHandoffPublicResponseCore } from './response';

function staffSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'staff-1',
      role: 'staff',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

const authority = mintTestTenantAuthority('tenant-1');
const tenantTwoAuthority = mintTestTenantAuthority('tenant-2');

describe('support handoff public response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([
      {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
    ]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectOrderBy.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([]);
  });

  it('rejects unauthorized and branch-manager response writes', async () => {
    await expect(
      updateSupportHandoffPublicResponseCore({
        authority,
        handoffId: 'handoff-1',
        response: 'Member-visible update',
        session: null,
      })
    ).resolves.toEqual({ error: 'Unauthorized', success: false });

    await expect(
      updateSupportHandoffPublicResponseCore({
        authority,
        handoffId: 'handoff-1',
        response: 'Member-visible update',
        session: staffSession({ role: 'branch_manager' }),
      })
    ).resolves.toEqual({ error: 'Unauthorized', success: false });

    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('requires non-empty response text', async () => {
    const result = await updateSupportHandoffPublicResponseCore({
      authority,
      handoffId: 'handoff-1',
      response: '   ',
      session: staffSession(),
    });

    expect(result).toEqual({ error: 'Public response is required', success: false });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('updates only accepted handoffs owned by the current staff with public response version CAS', async () => {
    const result = await updateSupportHandoffPublicResponseCore(
      {
        authority,
        expectedVersion: 4,
        handoffId: 'handoff-1',
        response: '  We reviewed your request and will follow up here.  ',
        session: staffSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
      success: true,
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicResponse: 'We reviewed your request and will follow up here.',
        publicResponseById: 'staff-1',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.public_response_version', 4);
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.lifecycle_version', 4);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_handoff.public_response_updated',
        metadata: expect.objectContaining({
          expectedVersion: 4,
          responseLength: 49,
        }),
      })
    );
  });

  it('truncates overlong response text at the domain maximum', async () => {
    const overlong = ` ${'a'.repeat(MAX_PUBLIC_RESPONSE_LENGTH + 50)} `;

    await updateSupportHandoffPublicResponseCore({
      authority,
      handoffId: 'handoff-1',
      response: overlong,
      session: staffSession(),
    });

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicResponse: 'a'.repeat(MAX_PUBLIC_RESPONSE_LENGTH),
      })
    );
  });

  it('reports response concurrency misses without audit logging', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await updateSupportHandoffPublicResponseCore(
      {
        authority,
        expectedVersion: 9,
        handoffId: 'handoff-1',
        response: 'Fresh response',
        session: staffSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      error: 'Handoff changed before response could be updated',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('does not audit tenant, branch, or assignee scoped write misses', async () => {
    mocks.updateReturning.mockResolvedValue([]);
    mocks.ensureTenantId.mockReturnValueOnce('tenant-2');

    for (const [scopedSession, scopedAuthority] of [
      [staffSession({ tenantId: 'tenant-2' }), tenantTwoAuthority],
      [staffSession({ branchId: 'branch-2' }), authority],
      [staffSession({ id: 'staff-2' }), authority],
    ] as const) {
      const result = await updateSupportHandoffPublicResponseCore(
        {
          authority: scopedAuthority,
          expectedVersion: 4,
          handoffId: 'handoff-1',
          response: 'Scoped response miss',
          session: scopedSession,
        },
        { logAuditEvent: mocks.logAuditEvent }
      );

      expect(result).toEqual({
        error: 'Handoff changed before response could be updated',
        success: false,
      });
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    }

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-2',
      'support_handoffs.tenant_id',
      expect.any(Object)
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-2');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-2');
  });
});
