import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { inspect } from 'node:util';
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

import { logAuditEvent as logAuditEventFromAction } from './audit';
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

  it('swallows a failed recovery audit insert and redacts every logged argument', async () => {
    const explanation = 'Private recovery explanation fixture';
    const driverDetail = 'Private driver detail fixture';
    const query = 'insert into audit_log (metadata) values ($1)';
    const loggers = (['error', 'warn', 'info', 'log', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    try {
      mocks.values.mockImplementationOnce(row => {
        const cause = Object.assign(new Error(driverDetail), { code: '42P01' });
        return Promise.reject(new DrizzleQueryError(query, [JSON.stringify(row.metadata)], cause));
      });

      await expect(
        logAuditEventFromAction({
          authority,
          action: 'claim.recovery_decision_saved',
          entityType: 'claim',
          metadata: { decisionReason: explanation },
        })
      ).resolves.toBeUndefined();
      expect(mocks.values).toHaveBeenCalledTimes(1);
      const logged = inspect(
        loggers.flatMap(logger => logger.mock.calls),
        { depth: null }
      );
      expect([explanation, driverDetail, query].some(value => logged.includes(value))).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to write audit log:',
        expect.objectContaining({ cause: expect.objectContaining({ code: '42P01' }) })
      );
    } finally {
      loggers.forEach(logger => logger.mockRestore());
    }
  });
});
