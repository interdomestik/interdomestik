import { hasTenantMemberCredential, issueTenantMemberNumber } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { type ProvisionOutcome, provisionEntry } from './provisioning';
import { listProvisioningWork } from './provisioning-facts';

export const PROVISIONING_BATCH_LIMIT = 200;

export type ProvisioningRunSummary = {
  processed: number;
  failed: number;
  outcomes: Partial<Record<ProvisionOutcome, number>>;
};

/**
 * ACQ-3b §3.7 cron pass for one tenant: each due entry runs in its own person transaction, one
 * after another. A failed entry is counted and retried by the next pass; it never blocks the rest.
 * A member created by a pass receives its member number after its transaction has committed.
 */
export async function runSponsorProvisioning(
  authority: TenantAuthority,
  options: { now: Date; limit?: number }
): Promise<ProvisioningRunSummary> {
  const { tenantId } = readTenantAuthority(authority);
  const ids = await withTenantAuthority(authority, tx =>
    listProvisioningWork(tx, tenantId, options.now, options.limit ?? PROVISIONING_BATCH_LIMIT)
  );
  const summary: ProvisioningRunSummary = { processed: 0, failed: 0, outcomes: {} };
  const hasCredential = (userId: string) => hasTenantMemberCredential(authority, userId);
  await ids.reduce<Promise<void>>(
    (previous, entryId) =>
      previous.then(async () => {
        try {
          const result = await provisionEntry(authority, {
            entryId,
            now: options.now,
            hasCredential,
          });
          summary.processed += 1;
          summary.outcomes[result.outcome] = (summary.outcomes[result.outcome] ?? 0) + 1;
          if (result.createdUserId) {
            await issueTenantMemberNumber(authority, {
              userId: result.createdUserId,
              joinedAt: options.now,
            });
          }
        } catch {
          summary.failed += 1;
        }
      }),
    Promise.resolve()
  );
  return summary;
}
