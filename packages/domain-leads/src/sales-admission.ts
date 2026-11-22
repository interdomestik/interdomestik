import type { TenantTransaction } from '@interdomestik/database';
import { assertNewSalesOpen, SalesClosedError } from '@interdomestik/database/pilot-switch';

export async function assertLeadSalesOpen(tx: TenantTransaction, tenantId: string): Promise<void> {
  try {
    await assertNewSalesOpen(tx, tenantId);
  } catch (error) {
    if (error instanceof SalesClosedError) throw error;
    console.error('Lead sales switch read failed', error);
    throw new SalesClosedError();
  }
}
