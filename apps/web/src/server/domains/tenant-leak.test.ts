import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertNoTenantLeak, type TenantLeakAssertableRow } from './tenant-leak';

function claimRow(id: string, tenantId: string): TenantLeakAssertableRow {
  return {
    claim: {
      id,
      tenantId,
    },
  };
}

describe('assertNoTenantLeak', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows rows that all belong to the requested tenant', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      assertNoTenantLeak(
        [claimRow('claim-1', 'tenant-a'), claimRow('claim-2', 'tenant-a')],
        'tenant-a'
      )
    ).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('throws when a row belongs to another tenant', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      assertNoTenantLeak(
        [claimRow('claim-1', 'tenant-a'), claimRow('claim-2', 'tenant-b')],
        'tenant-a'
      )
    ).toThrow('CRITICAL: Tenant Data Leak Detected! User tenant-a saw data from tenant-b');
    expect(errorSpy).toHaveBeenCalledWith('🚨 TENANT LEAK DETECTED', {
      userTenant: 'tenant-a',
      leakedRowId: 'claim-2',
      leakedRowTenant: 'tenant-b',
    });
  });
});
