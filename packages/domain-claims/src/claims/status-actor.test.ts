import * as tenantAuthority from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveClaimStatusActor } from './status-actor';

const tenantId = 'claims-tenant';
const userId = 'claim-actor';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('resolveClaimStatusActor', () => {
  it('derives a staff actor from the principal using the owning tenant', () => {
    const authority = mintTestTenantAuthority(tenantId, {
      accessTenantId: 'access-tenant',
      userId,
      role: 'staff',
    });
    expect(resolveClaimStatusActor(authority)).toEqual({
      kind: 'staff',
      id: userId,
      branchId: null,
      tenantId,
    });
  });

  it('uses the branch from a staff session principal', () => {
    const authority = mintTestTenantAuthority(tenantId, { userId, role: 'staff' });
    const descriptor = tenantAuthority.readTenantAuthority(authority);
    vi.spyOn(tenantAuthority, 'readTenantAuthority').mockReturnValueOnce({
      ...descriptor,
      purpose: 'session',
      principal: { userId, role: 'staff', branchId: 'claim-branch', agentId: null },
    });
    expect(resolveClaimStatusActor(authority)).toEqual({
      kind: 'staff',
      id: userId,
      branchId: 'claim-branch',
      tenantId,
    });
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])('derives a %s actor', role => {
    const authority = mintTestTenantAuthority(tenantId, { userId, role });
    expect(resolveClaimStatusActor(authority)).toEqual({
      kind: 'admin',
      id: userId,
      role,
      tenantId,
    });
  });

  it.each(['member', 'agent', 'branch_manager', 'auditor', 'global_support', 'unknown', null])(
    'rejects the role %s',
    role => {
      const authority = mintTestTenantAuthority(tenantId, { userId, role });
      expect(resolveClaimStatusActor(authority)).toBeNull();
    }
  );

  it('requires a principal', () => {
    expect(resolveClaimStatusActor(mintTestTenantAuthority(tenantId))).toBeNull();
  });

  it('rejects scheduled-work authorities used by cron and Inngest even with a principal', () => {
    const authority = mintTestTenantAuthority(tenantId, { userId, role: 'admin' });
    const descriptor = tenantAuthority.readTenantAuthority(authority);
    vi.spyOn(tenantAuthority, 'readTenantAuthority').mockReturnValueOnce({
      ...descriptor,
      purpose: 'scheduled-work',
    });
    expect(resolveClaimStatusActor(authority)).toBeNull();
  });

  it('rejects a test authority outside a test runner', () => {
    const authority = mintTestTenantAuthority(tenantId, { userId, role: 'staff' });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_TEST_CONTEXT', undefined);
    vi.stubEnv('TEST_WORKER_INDEX', undefined);
    expect(resolveClaimStatusActor(authority)).toBeNull();
  });
});
