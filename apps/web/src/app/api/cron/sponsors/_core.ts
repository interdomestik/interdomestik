import { forEachInOrder } from '@/lib/in-order';
import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { runSponsorCacheJob } from '@interdomestik/domain-membership-billing/sponsors/cache-job';
import { runSponsorHandovers } from '@interdomestik/domain-membership-billing/sponsors/handover-worker';
import {
  queueEndOffers,
  queueRenewalNotices,
} from '@interdomestik/domain-membership-billing/sponsors/mail-producers';
import { runSponsorMailOutbox } from '@interdomestik/domain-membership-billing/sponsors/mail-sender';
import { createHandoverPaddleClient } from '@interdomestik/domain-membership-billing/sponsors/paddle-handover-client';
import { runSponsorRetention } from '@interdomestik/domain-membership-billing/sponsors/retention';
import {
  runSponsorProvisioning,
  sponsorCredentialCheck,
} from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';

import { sponsorMailDeps } from './_mail';

export type SponsorCronStep =
  'provisioning' | 'handovers' | 'cache' | 'producers' | 'retention' | 'mail';

export type SponsorCronTenantResult = {
  tenantId: string;
  provisioning: { processed: number; failed: number; disabled: boolean } | null;
  handovers: { processed: number; failed: number } | null;
  mail: { claimed: number } | null;
  /** Steps that threw; the next pass retries them. */
  failedSteps: SponsorCronStep[];
  failed: boolean;
};

const MAIL_BATCH = 50;

/** Hourly work (cache, daily producers, retention) runs in the first pass of each hour. */
export function isHourlyPass(now: Date): boolean {
  return now.getUTCMinutes() < 5;
}

async function runTenant(
  tenantId: string,
  authority: TenantAuthority,
  now: Date
): Promise<SponsorCronTenantResult> {
  const result: SponsorCronTenantResult = {
    tenantId,
    provisioning: null,
    handovers: null,
    mail: null,
    failedSteps: [],
    failed: false,
  };
  const step = async (name: SponsorCronStep, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch {
      result.failedSteps.push(name);
    }
  };
  // The tenant switch gates only new provisioning; every other job always runs (§3.1).
  await step('provisioning', async () => {
    const provisioning = await runSponsorProvisioning(authority, { now });
    result.provisioning = {
      processed: provisioning.processed,
      failed: provisioning.failed,
      disabled: provisioning.disabled === true,
    };
  });
  await step('handovers', async () => {
    const handovers = await runSponsorHandovers(
      authority,
      {
        client: createHandoverPaddleClient(tenantId),
        hasCredential: sponsorCredentialCheck(authority),
      },
      { now }
    );
    result.handovers = { processed: handovers.processed, failed: handovers.failed };
  });
  if (isHourlyPass(now)) {
    await step('cache', async () => {
      await runSponsorCacheJob(authority, { now });
    });
    await step('producers', async () => {
      await queueRenewalNotices(authority, now);
      await queueEndOffers(authority, now);
    });
    await step('retention', async () => {
      await runSponsorRetention(authority, { now });
    });
  }
  await step('mail', async () => {
    const deps = sponsorMailDeps(tenantId, authority);
    if (!deps) throw new Error('sponsor_mail_unavailable');
    const mail = await runSponsorMailOutbox(authority, deps, { now, limit: MAIL_BATCH });
    result.mail = { claimed: mail.claimed };
  });
  result.failed = result.failedSteps.length > 0;
  return result;
}

/**
 * ACQ-3b §3.7 person jobs for every scheduled tenant, one tenant after another. Each tenant runs
 * under its own scheduled-work authority; a failing step is reported, retried by the next pass and
 * never stops the other steps or tenants.
 */
export async function runSponsorCronCore(params: {
  ingress: IngressCapability<'cron'>;
  now: Date;
}): Promise<SponsorCronTenantResult[]> {
  const results: SponsorCronTenantResult[] = [];
  await forEachInOrder(await listScheduledTenantWork(params.ingress), async work => {
    results.push(await runTenant(work.tenantId, work.authority, params.now));
  });
  return results;
}
