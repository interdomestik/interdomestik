import type { TenantTransaction } from '@interdomestik/database';
import { assertNewSalesOpen, SalesClosedError } from '@interdomestik/database/pilot-switch';

export async function assertSponsorSalesOpen(tx: TenantTransaction, tenantId: string) {
  try {
    await assertNewSalesOpen(tx, tenantId);
  } catch (error) {
    if (error instanceof SalesClosedError) {
      throw error;
    }
    console.error('[Sponsors] Failed to read new sales admission', error);
    throw new SalesClosedError();
  }
}
