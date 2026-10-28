import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditLog: { name: 'audit_log' },
  insert: vi.fn(),
  values: vi.fn(),
  withTenantContext: vi.fn(),
  unscopedInsert: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  auditLog: mocks.auditLog,
  db: { insert: mocks.unscopedInsert },
  withTenantContext: mocks.withTenantContext,
}));

import { logMessageAuditEvent } from './audit.core';

describe('logMessageAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
    mocks.withTenantContext.mockImplementation(async (_context, action) =>
      action({ insert: mocks.insert })
    );
  });

  it('writes the message audit in its own tenant context with request metadata', async () => {
    await logMessageAuditEvent({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      actorRole: 'member',
      action: 'claim.message_sent',
      entityType: 'claim',
      entityId: 'claim-1',
      metadata: { internal: false, length: 5 },
      headers: new Headers({
        'x-forwarded-for': '192.0.2.1, 192.0.2.2',
        'user-agent': 'Audit test',
      }),
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'member' },
      expect.any(Function)
    );
    expect(mocks.insert).toHaveBeenCalledWith(mocks.auditLog);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorRole: 'member',
        action: 'claim.message_sent',
        entityType: 'claim',
        entityId: 'claim-1',
        metadata: { internal: false, length: 5, ip: '192.0.2.1', userAgent: 'Audit test' },
      })
    );
    expect(mocks.unscopedInsert).not.toHaveBeenCalled();
  });

  it('does not use event metadata to select a tenant context', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await logMessageAuditEvent({
        action: 'claim.message_sent',
        entityType: 'claim',
        metadata: { tenantId: 'tenant-2' },
      });

      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('accepts an explicit tenant and optional role', async () => {
    await logMessageAuditEvent({
      tenantId: 'tenant-2',
      action: 'claim.message_sent',
      entityType: 'claim',
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-2', role: undefined },
      expect.any(Function)
    );
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-2', actorRole: null, metadata: {} })
    );
  });

  it.each(['context', 'insert'] as const)(
    'swallows and logs a %s failure after attempting the audit',
    async failure => {
      const error = new Error('audit unavailable');
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      if (failure === 'context') mocks.withTenantContext.mockRejectedValueOnce(error);
      else mocks.values.mockRejectedValueOnce(error);

      try {
        await expect(
          logMessageAuditEvent({
            tenantId: 'tenant-1',
            action: 'claim.message_sent',
            entityType: 'claim',
          })
        ).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith('Failed to write audit log:', error);
      } finally {
        log.mockRestore();
      }
    }
  );
});
