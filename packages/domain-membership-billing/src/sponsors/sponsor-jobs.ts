import {
  and,
  eq,
  hasTenantMemberCredential,
  issueTenantMemberNumber,
  tenantSettings,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { type ProvisionOutcome, provisionEntry } from './provisioning';
import { listProvisioningWork } from './provisioning-facts';

export const PROVISIONING_BATCH_LIMIT = 200;

/** SRS OD-18 / ACQ-3a tenant switch: list upload and new provisioning stay dark until enabled. */
export const SPONSORED_IMPORT_SETTING = {
  category: 'acquisition',
  key: 'sponsored_import',
} as const;

export async function isSponsorProvisioningEnabled(authority: TenantAuthority): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  const [setting] = await withTenantAuthority(authority, tx =>
    tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.category, SPONSORED_IMPORT_SETTING.category),
          eq(tenantSettings.key, SPONSORED_IMPORT_SETTING.key)
        )
      )
      .limit(1)
  );
  const value = setting?.value as { enabled?: unknown } | null | undefined;
  return value?.enabled === true;
}

/** The credential snapshot read used by sponsor jobs (§3.7 activation); the one privileged caller. */
export function sponsorCredentialCheck(
  authority: TenantAuthority
): (userId: string) => Promise<boolean> {
  return userId => hasTenantMemberCredential(authority, userId);
}

export type ProvisioningRunSummary = {
  disabled?: true;
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
  if (!(await isSponsorProvisioningEnabled(authority))) {
    return { disabled: true, processed: 0, failed: 0, outcomes: {} };
  }
  const ids = await withTenantAuthority(authority, tx =>
    listProvisioningWork(tx, tenantId, options.now, options.limit ?? PROVISIONING_BATCH_LIMIT)
  );
  const summary: ProvisioningRunSummary = { processed: 0, failed: 0, outcomes: {} };
  const hasCredential = sponsorCredentialCheck(authority);
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
