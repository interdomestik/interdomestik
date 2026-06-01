export interface TenantLeakAssertableRow {
  claim: {
    id: string;
    tenantId: string | null;
  };
}

export function assertNoTenantLeak(
  rows: readonly TenantLeakAssertableRow[],
  tenantId: string
): void {
  const leakingRow = rows.find(row => row.claim.tenantId !== tenantId);
  if (!leakingRow) return;

  console.error('🚨 TENANT LEAK DETECTED', {
    userTenant: tenantId,
    leakedRowId: leakingRow.claim.id,
    leakedRowTenant: leakingRow.claim.tenantId,
  });
  throw new Error(
    `CRITICAL: Tenant Data Leak Detected! User ${tenantId} saw data from ${leakingRow.claim.tenantId}`
  );
}
