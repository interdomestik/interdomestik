import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  auditLog: { table: 'audit_log' },
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('nanoid', () => ({ nanoid: () => 'audit-1' }));

import { logAuditEvent } from './audit.core';

const authority = mintTestTenantAuthority('tenant-1');

describe('logAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTERDOMESTIK_AUTOMATED;
    mocks.values.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.withTenantContext.mockImplementation(
      async (_authority: unknown, action: (tx: unknown) => unknown) =>
        action({ insert: mocks.insert })
    );
  });

  it('writes the row inside the supplied authority and takes the tenant from it', async () => {
    await logAuditEvent({
      authority,
      actorId: 'actor-1',
      actorRole: 'admin',
      action: 'claim.updated',
      entityType: 'claim',
      entityId: 'claim-1',
      metadata: { note: 'kept' },
      headers: new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'ua' }),
    });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-1',
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        actorRole: 'admin',
        action: 'claim.updated',
        entityType: 'claim',
        entityId: 'claim-1',
        metadata: { note: 'kept', ip: '203.0.113.7', userAgent: 'ua' },
      })
    );
  });

  it('never lets a metadata tenant id choose the tenant of the row', async () => {
    await logAuditEvent({
      authority,
      action: 'claim.updated',
      entityType: 'claim',
      metadata: { tenantId: 'tenant-2' },
    });

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }));
  });

  it('writes nothing when no authority is supplied', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await logAuditEvent({
        authority: undefined as never,
        action: 'claim.updated',
        entityType: 'claim',
      });

      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('swallows a database failure after logging it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.values.mockRejectedValueOnce(new Error('db down'));

      await expect(
        logAuditEvent({ authority, action: 'claim.updated', entityType: 'claim' })
      ).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalledWith('Failed to write audit log:', expect.any(Error));
    } finally {
      errors.mockRestore();
    }
  });
});
