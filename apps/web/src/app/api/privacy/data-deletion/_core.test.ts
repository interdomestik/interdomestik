import { describe, expect, it, vi } from 'vitest';
import { REQUEST_DATA_DELETION_ACTION, requestDataDeletionCore } from './_core';

describe('requestDataDeletionCore', () => {
  it('returns 400 when tenantId is missing', async () => {
    const result = await requestDataDeletionCore({
      userId: 'user_1',
      tenantId: null,
    });

    expect(result).toEqual({
      status: 400,
      body: {
        success: false,
        error: 'Missing tenantId',
      },
    });
  });

  it('creates a new deletion request when none exists', async () => {
    const now = new Date('2026-02-27T09:00:00.000Z');
    const findLatestRequest = vi.fn().mockResolvedValue(null);
    const insertRequest = vi.fn().mockResolvedValue('req_123');

    const result = await requestDataDeletionCore({
      userId: 'user_1',
      tenantId: 'tenant_ks',
      actorRole: 'member',
      reason: '  Please delete my personal data  ',
      ipAddress: '203.0.113.10',
      userAgent: 'Vitest Browser',
      now,
      deps: {
        findLatestRequest,
        insertRequest,
      },
    });

    expect(findLatestRequest).toHaveBeenCalledWith({
      tenantId: 'tenant_ks',
      userId: 'user_1',
    });
    expect(insertRequest).toHaveBeenCalledWith({
      tenantId: 'tenant_ks',
      userId: 'user_1',
      actorRole: 'member',
      reason: 'Please delete my personal data',
      ipAddress: '203.0.113.10',
      userAgent: 'Vitest Browser',
      requestedAt: now,
    });
    expect(result).toEqual({
      status: 202,
      body: {
        success: true,
        requestId: 'req_123',
        alreadyPending: false,
      },
    });
  });

  it('returns existing request when a recent pending request exists', async () => {
    const now = new Date('2026-02-27T09:00:00.000Z');
    const recent = new Date('2026-02-21T09:00:00.000Z');
    const insertRequest = vi.fn();

    const result = await requestDataDeletionCore({
      userId: 'user_2',
      tenantId: 'tenant_mk',
      now,
      deps: {
        findLatestRequest: vi.fn().mockResolvedValue({
          id: 'req_recent',
          createdAt: recent,
        }),
        insertRequest,
      },
    });

    expect(insertRequest).not.toHaveBeenCalled();
    expect(result.status).toBe(202);
    expect(result.body.success).toBe(true);
    if (!result.body.success) {
      throw new Error(`Expected success response, got error: ${result.body.error}`);
    }
    expect(result.body.requestId).toBe('req_recent');
    expect(result.body.alreadyPending).toBe(true);
    expect(result.body.retryAfterDays).toBeGreaterThan(0);
  });

  it('creates a new request when cooldown has elapsed', async () => {
    const now = new Date('2026-02-27T09:00:00.000Z');
    const stale = new Date('2025-12-20T09:00:00.000Z');
    const insertRequest = vi.fn().mockResolvedValue('req_fresh');

    const result = await requestDataDeletionCore({
      userId: 'user_3',
      tenantId: 'tenant_al',
      now,
      deps: {
        findLatestRequest: vi.fn().mockResolvedValue({
          id: 'req_old',
          createdAt: stale,
        }),
        insertRequest,
      },
    });

    expect(insertRequest).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 202,
      body: {
        success: true,
        requestId: 'req_fresh',
        alreadyPending: false,
      },
    });
  });

  it('records the expected audit action name', async () => {
    const insertRequest = vi.fn().mockResolvedValue('req_action');

    await requestDataDeletionCore({
      userId: 'user_4',
      tenantId: 'tenant_ks',
      deps: {
        findLatestRequest: vi.fn().mockResolvedValue(null),
        insertRequest,
      },
    });

    expect(REQUEST_DATA_DELETION_ACTION).toBe('privacy.data_deletion_requested');
  });
});
