import { mintTenantAuthority, type TenantAuthority } from '../tenant-authority';

// Test-only minting. The db-access guard admits this import only from test files, and it refuses
// to run outside a test runner (vitest, node:test, or a Playwright worker for E2E specs that call
// domain cores directly).
function isTestRunner(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.VITEST || process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX)
  );
}

export function mintTestTenantAuthority(
  tenantId: string,
  options: { accessTenantId?: string; userId?: string; role?: string | null } = {}
): TenantAuthority {
  if (!isTestRunner()) {
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
