/**
 * Feature Flags
 *
 * Simple environment-based feature flag utility.
 * For production, consider using a proper feature flag service.
 */

/**
 * Branch Dashboard Page feature flag
 * Enable via FEATURE_BRANCH_DASHBOARD=true in environment
 */
export function isBranchDashboardEnabled(): boolean {
  return process.env.FEATURE_BRANCH_DASHBOARD === 'true';
}

const STAFF_AUTH_TOLERANT_TENANTS_FLAG = 'STAFF_AUTH_TOLERANT_TENANTS';

export function getStaffAuthTolerantTenants(): Set<string> {
  const rawValue = process.env[STAFF_AUTH_TOLERANT_TENANTS_FLAG];
  if (!rawValue || rawValue.trim().length === 0) {
    return new Set();
  }

  const tenants = new Set<string>();
  for (const candidate of rawValue.split(',')) {
    const normalized = candidate.trim().toLowerCase();
    if (normalized) {
      tenants.add(normalized);
    }
  }

  return tenants;
}

export function isStaffAuthTolerantTenant(tenantId: string | null | undefined): boolean {
  const normalizedTenantId = tenantId?.trim().toLowerCase();
  if (!normalizedTenantId) return false;
  return getStaffAuthTolerantTenants().has(normalizedTenantId);
}
