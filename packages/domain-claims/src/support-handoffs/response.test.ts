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
    mocks.transaction.mockImplementation((_authority, run) => run(mocks.db));
    mocks.enqueue.mockResolvedValue(undefined);
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
    mocks.selectLock.mockResolvedValue([{ id: 'handoff-1' }]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ for: mocks.selectLock, limit: mocks.selectLimit });
    mocks.selectOrderBy.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([{ epochMs: Date.UTC(2026, 10, 22, 10) }]);
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
    expect(mocks.updateSet.mock.calls[0][0]).not.toHaveProperty('firstPublicResponseAt');
    expect(mocks.enqueue).toHaveBeenCalledWith(mocks.db, 'tenant-1', 'member-1', {
      id: 'handoff-1',
      responseVersion: 2,
    });
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

  it('rolls back the first response when its in-app insert fails', async () => {
    let committed = false;
    mocks.transaction.mockImplementationOnce(async (_authority, run) => {
      const row = await run(mocks.db);
      committed = true;
      return row;
    });
    const error = Object.assign(new Error('query parameters: First answer'), { code: '23514' });
    mocks.enqueue.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        updateSupportHandoffPublicResponseCore(
          {
            authority,
            handoffId: 'handoff-1',
            response: 'First answer',
            session: staffSession(),
          },
          { logAuditEvent: mocks.logAuditEvent }
        )
      ).resolves.toEqual({
        success: false,
        error: 'Public response could not be saved',
      });
      const patch = mocks.updateSet.mock.calls[0][0];
      expect(patch.firstPublicResponseAt).toEqual(new Date('2026-11-22T10:00:00Z'));
      expect(patch.firstPublicResponseAt).toBe(patch.publicResponseAt);
      expect(mocks.selectLock).toHaveBeenCalledWith('no key update');
      expect(mocks.selectLock.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.selectLimit.mock.invocationCallOrder[0]
      );
      expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.public_response_version', 0);
      expect(mocks.enqueue).toHaveBeenCalledTimes(1);
      expect(committed).toBe(false);
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Support handoff public response transaction failed',
        expect.objectContaining({
          message: 'Support handoff public response transaction failed',
          cause: { name: 'Error', code: '23514' },
        })
      );
    } finally {
      log.mockRestore();
    }
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
    mocks.selectLock.mockResolvedValue([]);
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
