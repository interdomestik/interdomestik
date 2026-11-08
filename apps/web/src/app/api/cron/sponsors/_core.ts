import { forEachInOrder } from '@/lib/in-order';
import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { runSponsorHandovers } from '@interdomestik/domain-membership-billing/sponsors/handover-worker';
import { createHandoverPaddleClient } from '@interdomestik/domain-membership-billing/sponsors/paddle-handover-client';
import {
  runSponsorProvisioning,
  sponsorCredentialCheck,
} from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';

export type SponsorCronTenantResult = {
  tenantId: string;
  provisioning: { processed: number; failed: number; disabled: boolean } | null;
  handovers: { processed: number; failed: number } | null;
  failed: boolean;
};

/**
 * ACQ-3b §3.7 person jobs for every scheduled tenant, one tenant after another. Each tenant runs
 * under its own scheduled-work authority; a failing tenant is reported and never stops the rest.
 * The tenant switch gates only new provisioning; handover work always runs (§3.1).
 */
export async function runSponsorCronCore(params: {
  ingress: IngressCapability<'cron'>;
  now: Date;
}): Promise<SponsorCronTenantResult[]> {
  const results: SponsorCronTenantResult[] = [];
  await forEachInOrder(await listScheduledTenantWork(params.ingress), async work => {
    const result: SponsorCronTenantResult = {
      tenantId: work.tenantId,
      provisioning: null,
      handovers: null,
      failed: false,
    };
    try {
      const provisioning = await runSponsorProvisioning(work.authority, { now: params.now });
      result.provisioning = {
        processed: provisioning.processed,
        failed: provisioning.failed,
        disabled: provisioning.disabled === true,
      };
      const handovers = await runSponsorHandovers(
        work.authority,
        {
          client: createHandoverPaddleClient(work.tenantId),
          hasCredential: sponsorCredentialCheck(work.authority),
        },
        { now: params.now }
      );
      result.handovers = { processed: handovers.processed, failed: handovers.failed };
    } catch {
      result.failed = true;
    }
    results.push(result);
  });
  return results;
}
