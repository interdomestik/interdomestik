import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  relayClaimStatusAuditProjectionEvents: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  relayClaimStatusAuditProjectionEvents: mocks.relayClaimStatusAuditProjectionEvents,
  withTenantContext: mocks.withTenantContext,
}));

import {
  activateClaimStatusAuditProjection,
  projectClaimStatusAuditProjection,
} from './audit-projection';

describe('claim status audit projection activation', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback('tx'));
    mocks.relayClaimStatusAuditProjectionEvents.mockResolvedValue({
      consumerInvocations: 1,
      deliveryRecordsAlreadyExisted: 0,
      deliveryRecordsCreated: 1,
      selected: 1,
    });
  });

  it('runs the claim status audit projection through a relay transaction', async () => {
    await expect(projectClaimStatusAuditProjection({ authority })).resolves.toMatchObject({
      deliveryRecordsCreated: 1,
      selected: 1,
    });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.relayClaimStatusAuditProjectionEvents).toHaveBeenCalledWith('tx', {
      limit: 10,
      tenantId: 'tenant-1',
    });
  });

  it('uses an injected projection runner for status writers', async () => {
    const projectClaimStatusAuditProjection = vi.fn().mockResolvedValue(undefined);

    await activateClaimStatusAuditProjection({
      authority,
      deps: { projectClaimStatusAuditProjection },
    });

    expect(projectClaimStatusAuditProjection).toHaveBeenCalledWith({
      authority,
      limit: 10,
    });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('reports projection failures without hiding retryability behind delivery records', async () => {
    const error = new Error('audit sink unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      activateClaimStatusAuditProjection({
        authority,
        deps: { projectClaimStatusAuditProjection: vi.fn().mockRejectedValue(error) },
      })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith('Failed to project claim status audit event:', error);
    consoleError.mockRestore();
  });
});
