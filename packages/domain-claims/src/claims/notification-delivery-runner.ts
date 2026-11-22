import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  configuredEmailTransports,
  sendEmailOutcome,
  type EmailTransport,
} from '@interdomestik/domain-communications/email';
import { isPushConfigured, sendPushOutcome } from '@interdomestik/domain-communications/push';
import {
  prepareNotificationDelivery,
  type PreparedNotificationDelivery,
} from './prepare-notification-delivery';
import {
  claimNotificationDelivery,
  finishNotificationDelivery,
  readDeliveryUnderLease,
  refundNotificationAttempt,
  writeNotificationTransport,
  chooseTransport,
  deliveryFailure,
  type AttemptResult,
  type ClaimedDelivery,
  type DeliveryDependencies,
  type PushDeliverySubscription,
  type RunSummary,
} from '@interdomestik/domain-communications/notification-deliveries/worker';
import { reportServerError } from '@interdomestik/domain-communications/server-error';

const scheduled = {
  budgetMs: 240_000,
  claimMs: 90_000,
  providerTimeoutMs: 60_000,
  reserveMs: 10_000,
};
const kick = { budgetMs: 25_000, claimMs: 20_000, providerTimeoutMs: 10_000, reserveMs: 5_000 };
type Timing = typeof scheduled;

type WorkContext = {
  authority: TenantAuthority;
  deps: DeliveryDependencies;
  timing: Timing;
  end: number;
  now: () => number;
  summary: RunSummary;
};

async function sendPreparedDelivery(
  deps: DeliveryDependencies,
  prepared: PreparedNotificationDelivery,
  transport: NonNullable<ClaimedDelivery['transport']>,
  deliveryId: string,
  timeoutMs: number
): Promise<AttemptResult> {
  try {
    let result;
    if (prepared.channel === 'push') {
      result = await (deps.sendPush ?? sendPushOutcome)(prepared.subscription, prepared.rendered, {
        timeoutMs,
      });
    } else if (transport === 'webpush') {
      return deliveryFailure('transport_unavailable', false);
    } else {
      result = await (deps.sendEmail ?? sendEmailOutcome)(
        transport,
        prepared.to,
        prepared.rendered,
        {
          idempotencyKey: deliveryId,
          timeoutMs,
        }
      );
    }
    return result ?? deliveryFailure('provider_failed', true);
  } catch (error) {
    reportServerError('Notification delivery provider call failed', error);
    return { ...deliveryFailure('provider_failed', true), ambiguous: true };
  }
}

function resolveDeliveryTransport(
  row: ClaimedDelivery,
  deps: DeliveryDependencies,
  configured: readonly EmailTransport[]
) {
  if (row.channel === 'push' && !(deps.pushConfigured ?? isPushConfigured)()) {
    return deliveryFailure(row.transport ? 'transport_unavailable' : 'missing_vapid', false);
  }
  const transport = chooseTransport(row, configured);
  if (!transport) {
    return deliveryFailure(
      row.transport ? 'transport_unavailable' : 'email_unconfigured',
      !row.transport
    );
  }
  return transport;
}

async function workClaim(ctx: WorkContext, row: ClaimedDelivery) {
  const { authority, deps, summary, timing, end, now } = ctx;
  const configured = (deps.emailTransports ?? configuredEmailTransports)();
  const finish = async (
    result: AttemptResult,
    locale: ClaimedDelivery['locale'] = null,
    transport: ClaimedDelivery['transport'] = null,
    subscription?: PushDeliverySubscription
  ) => {
    if ('ok' in result && !result.ok) summary.failures.push({ id: row.id, code: result.code });
    const state = await withTenantAuthority(authority, tx =>
      finishNotificationDelivery(tx, row, result, locale, transport, configured, subscription)
    );
    summary[state]++;
    // A refunded stale decision leaves the row immediately due for the next run.
    return !('skip' in result && result.skip === 'stale' && state === 'queued');
  };

  const prepared = await withTenantAuthority(authority, tx =>
    prepareNotificationDelivery(tx, row, deps)
  ).catch(error => {
    reportServerError('Notification delivery preparation failed', error);
    return deliveryFailure('facts_unavailable', true);
  });
  if ('ok' in prepared) {
    await finish(prepared);
    return true;
  }
  if ('leaseLost' in prepared) {
    summary.lease_lost++;
    return true;
  }
  if ('skip' in prepared) {
    return finish(prepared);
  }

  const transport = resolveDeliveryTransport(row, deps, configured);
  if (typeof transport !== 'string') {
    await finish(transport, prepared.locale);
    return true;
  }

  const refundBudget = async (restoreTransport = false) => {
    const state = await withTenantAuthority(authority, async tx => {
      if (!restoreTransport && (await readDeliveryUnderLease(tx, row))?.stale) return 'stale';
      const refunded = await refundNotificationAttempt(tx, row, restoreTransport);
      return refunded ? 'budget_short' : 'lease_lost';
    });
    if (state === 'stale') {
      return finish({ skip: 'stale' }, prepared.locale);
    }
    summary[state]++;
    return false;
  };
  const beforeWrite = now();
  if (end - beforeWrite < timing.providerTimeoutMs + timing.reserveMs) return refundBudget();
  const callDeadline = beforeWrite + timing.providerTimeoutMs;
  const write = await withTenantAuthority(authority, tx =>
    writeNotificationTransport(tx, row, transport, callDeadline, now)
  );
  if (write === 'stale') {
    return finish({ skip: 'stale' }, prepared.locale);
  }
  if (typeof write === 'string') {
    summary[write]++;
    return write === 'lease_lost';
  }

  const beforeSend = now();
  if (beforeSend >= write.expiresAt) {
    return finish({ skip: 'stale' }, prepared.locale);
  }
  const timeoutMs = callDeadline - beforeSend;
  if (timeoutMs < 1000) return refundBudget(true);
  const outcome = await sendPreparedDelivery(deps, prepared, transport, row.id, timeoutMs);
  const subscription = prepared.channel === 'push' ? prepared.subscription : undefined;
  await finish(outcome, prepared.locale, transport, subscription);
  return true;
}

async function run(
  authority: TenantAuthority,
  deps: DeliveryDependencies,
  timing: Timing,
  ids?: readonly string[]
) {
  const { tenantId } = readTenantAuthority(authority);
  const now = deps.now ?? (() => performance.now());
  const end = now() + timing.budgetMs;
  const summary: RunSummary = {
    sent: 0,
    skipped: 0,
    queued: 0,
    failed: 0,
    lease_lost: 0,
    lease_short: 0,
    budget_short: 0,
    failures: [],
  };
  while (end - now() >= timing.claimMs) {
    const claim = await withTenantAuthority(authority, tx =>
      claimNotificationDelivery(tx, tenantId, ids)
    );
    if (!claim) break;
    if (claim.status === 'failed') {
      summary.failed++;
      summary.failures.push({ id: claim.id, code: 'lease_expired' });
      continue;
    }
    if (!(await workClaim({ authority, deps, timing, end, now, summary }, claim.row))) break;
  }
  return summary;
}

export function runNotificationDeliveries(
  authority: TenantAuthority,
  deps: DeliveryDependencies,
  { budgetMs = scheduled.budgetMs, providerTimeoutMs = scheduled.providerTimeoutMs } = {}
) {
  return run(authority, deps, {
    ...scheduled,
    budgetMs: Math.min(budgetMs, scheduled.budgetMs),
    providerTimeoutMs: Math.min(providerTimeoutMs, scheduled.providerTimeoutMs),
  });
}

export function dispatchNotificationDeliveries(
  authority: TenantAuthority,
  deps: DeliveryDependencies,
  { ids }: { ids: readonly string[] }
) {
  return run(authority, deps, kick, ids);
}
