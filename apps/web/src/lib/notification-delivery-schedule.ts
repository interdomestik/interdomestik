import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { runNotificationDeliveries } from '@interdomestik/domain-claims/claims/notification-delivery-runner';
import { claimNotificationDeliveryDeps } from './claim-notification-delivery-deps';
import { forEachInOrder } from './in-order';

export async function runNotificationDeliverySchedule(
  ingress: IngressCapability<'inngest' | 'cron'>
) {
  const startedAt = performance.now();
  const rotation = Math.floor(Date.now() / 300_000);
  const tenants = await listScheduledTenantWork(ingress);
  const offset = tenants.length ? rotation % tenants.length : 0;
  const ordered = [...tenants.slice(offset), ...tenants.slice(0, offset)];
  const summary = {
    tenants: 0,
    tenantFailures: 0,
    sent: 0,
    skipped: 0,
    queued: 0,
    failed: 0,
    leaseLost: 0,
    leaseShort: 0,
    budgetShort: 0,
  };
  await forEachInOrder(ordered, async ({ tenantId, authority }) => {
    const budgetMs = 240_000 - (performance.now() - startedAt);
    if (budgetMs < 90_000) return;
    try {
      const result = await runNotificationDeliveries(authority, claimNotificationDeliveryDeps, {
        budgetMs,
        providerTimeoutMs: 60_000,
      });
      summary.tenants++;
      summary.sent += result.sent;
      summary.skipped += result.skipped;
      summary.queued += result.queued;
      summary.failed += result.failed;
      summary.leaseLost += result.lease_lost;
      summary.leaseShort += result.lease_short;
      summary.budgetShort += result.budget_short;
    } catch (error) {
      const code = error instanceof Error ? error.name : 'UnknownError';
      console.error('[Notification deliveries] Tenant run failed', {
        tenantId,
        error: new Error('Notification tenant run failed', { cause: code }),
      });
      summary.tenantFailures++;
    }
  });
  return summary;
}
