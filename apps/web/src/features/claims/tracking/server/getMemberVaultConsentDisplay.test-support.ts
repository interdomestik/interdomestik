import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

export function tenantChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn((_condition: unknown) => ({ limit }));
  return { from: vi.fn(() => ({ where })), limit, where };
}

export function rowsChain(rows: unknown[]) {
  const where = vi.fn((_condition: unknown) => Promise.resolve(rows));
  return { from: vi.fn(() => ({ where })), where };
}

export function orderedRowsChain(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn((_condition: unknown) => ({ orderBy }));
  return { from: vi.fn(() => ({ where })), orderBy, where };
}

export const baseTenantId = 'tenant-mk';
export const baseAuthority = mintTestTenantAuthority(baseTenantId);

export const baseParams = {
  memberId: 'member-1',
  claimId: 'claim-1',
  claimCategory: 'vehicle',
  piiStatus: 'available' as const,
};
