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
import {
  runSponsorMailOutbox,
  type SponsorMailSummary,
} from '@interdomestik/domain-membership-billing/sponsors/mail-sender';
import { createHandoverPaddleClient } from '@interdomestik/domain-membership-billing/sponsors/paddle-handover-client';
import {
  runSponsorRetention,
  type SponsorRetentionResult,
} from '@interdomestik/domain-membership-billing/sponsors/retention';
import {
  runSponsorProvisioning,
  sponsorCredentialCheck,
} from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import { captureException } from '@sentry/nextjs';

import { sponsorMailDeps } from './_mail';

export type SponsorCronStep =
  'provisioning' | 'handovers' | 'cache' | 'producers' | 'retention' | 'mail';

export type SponsorCronTenantResult = {
  tenantId: string;
  provisioning: {
    processed: number;
    failed: number;
    disabled: boolean;
    salesClosed?: number;
  } | null;
  handovers: { processed: number; failed: number } | null;
  retention: SponsorRetentionResult | null;
  mail: SponsorMailSummary | null;
  /** Steps that threw or reported incomplete work. */
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
    retention: null,
    mail: null,
    failedSteps: [],
    failed: false,
  };
  const step = async (name: SponsorCronStep, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      result.failedSteps.push(name);
      captureException(error, { tags: { operation: `sponsor.cron.${name}` } });
    }
  };
  // The tenant switch gates only new provisioning; every other job always runs (§3.1).
  await step('provisioning', async () => {
    const provisioning = await runSponsorProvisioning(authority, { now });
    const summary: NonNullable<SponsorCronTenantResult['provisioning']> = {
      processed: provisioning.processed,
      failed: provisioning.failed,
      disabled: provisioning.disabled === true,
    };
    if (provisioning.outcomes.sales_closed) {
      summary.salesClosed = provisioning.outcomes.sales_closed;
    }
    result.provisioning = summary;
    if (summary.failed > 0) result.failedSteps.push('provisioning');
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
    if (handovers.failed > 0) result.failedSteps.push('handovers');
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
      result.retention = await runSponsorRetention(authority, { now });
    });
  }
  await step('mail', async () => {
    const deps = sponsorMailDeps(tenantId, authority);
    if (!deps) throw new Error('sponsor_mail_unavailable');
    const mail = await runSponsorMailOutbox(authority, deps, {
      now: new Date(),
      limit: MAIL_BATCH,
    });
    result.mail = mail;
    if (
      Object.entries(mail.outcomes).some(
        ([outcome, count]) => count > 0 && outcome !== 'sent' && outcome !== 'skipped'
      )
    ) {
      result.failedSteps.push('mail');
    }
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
