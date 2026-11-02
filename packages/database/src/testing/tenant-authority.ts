import { mintTenantAuthority, type TenantAuthority } from '../tenant-authority';

// Test-only minting. The db-access guard admits this import only from test files, and it refuses
// to run outside a test runner.
export function mintTestTenantAuthority(
  tenantId: string,
  options: { accessTenantId?: string; userId?: string; role?: string | null } = {}
): TenantAuthority {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && !process.env.NODE_TEST_CONTEXT) {
    throw new Error('Test tenant authority is available only under a test runner');
  }
  return mintTenantAuthority({
    tenantId,
    accessTenantId: options.accessTenantId,
    purpose: 'test',
    principal: options.userId
      ? { userId: options.userId, role: options.role ?? null, branchId: null, agentId: null }
      : null,
  });
}
