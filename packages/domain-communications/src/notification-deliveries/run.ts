import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { configuredEmailTransports, sendEmailOutcome } from '../email';
import { isPushConfigured, sendPushOutcome } from '../push';
import { prepareNotificationDelivery } from './prepare';
import {
  claimNotificationDelivery,
  finishNotificationDelivery,
  refundNotificationAttempt,
  writeNotificationTransport,
} from './store';
import { chooseTransport, deliveryFailure } from './transport';
import type { AttemptResult, ClaimedDelivery, DeliveryDependencies, RunSummary } from './types';

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

async function workClaim(ctx: WorkContext, row: ClaimedDelivery) {
  const { authority, deps, summary, timing, end, now } = ctx;
  const inTenant = <T>(action: Parameters<typeof withTenantAuthority<T>>[1]) =>
    withTenantAuthority(authority, action);
  const configured = (deps.emailTransports ?? configuredEmailTransports)();
  const finish = async (
    result: AttemptResult,
    locale: ClaimedDelivery['locale'] = null,
    transport: ClaimedDelivery['transport'] = null
  ) => {
    if ('ok' in result && !result.ok) summary.failures.push({ id: row.id, code: result.code });
    const state = await inTenant(tx =>
      finishNotificationDelivery(tx, row, result, locale, transport, configured)
    );
    summary[state]++;
  };

  const prepared = await inTenant(tx => prepareNotificationDelivery(tx, row, deps)).catch(() =>
    deliveryFailure('facts_unavailable', true)
  );
  if ('ok' in prepared) {
    await finish(prepared);
    return true;
  }
  if ('leaseLost' in prepared) {
    summary.lease_lost++;
    return true;
  }
  if ('skip' in prepared) {
    await finish(prepared);
    return true;
  }

  if (row.channel === 'push' && !(deps.pushConfigured ?? isPushConfigured)()) {
    await finish(
      deliveryFailure(row.transport ? 'transport_unavailable' : 'missing_vapid', false),
      prepared.locale
    );
    return true;
  }
  const transport = chooseTransport(row, configured);
  if (!transport) {
    await finish(
      deliveryFailure(
        row.transport ? 'transport_unavailable' : 'email_unconfigured',
        !row.transport
      ),
      prepared.locale
    );
    return true;
  }

  const refundBudget = async (restoreTransport = false) => {
    const refunded = await inTenant(tx => refundNotificationAttempt(tx, row, restoreTransport));
    summary[refunded ? 'budget_short' : 'lease_lost']++;
    return false;
  };
  const beforeWrite = now();
  if (end - beforeWrite < timing.providerTimeoutMs + timing.reserveMs) return refundBudget();
  const callDeadline = beforeWrite + timing.providerTimeoutMs;
  const write = await inTenant(tx =>
    writeNotificationTransport(tx, row, transport, callDeadline, now)
  );
  if (write !== 'written') {
    summary[write]++;
    return write === 'lease_lost';
  }

  const timeoutMs = callDeadline - now();
  if (timeoutMs < 1000) return refundBudget(true);
  let outcome: AttemptResult;
  try {
    const result =
      prepared.channel === 'push'
        ? await (deps.sendPush ?? sendPushOutcome)(prepared.subscription, prepared.rendered, {
            timeoutMs,
          })
        : transport === 'webpush'
          ? deliveryFailure('transport_unavailable', false)
          : await (deps.sendEmail ?? sendEmailOutcome)(transport, prepared.to, prepared.rendered, {
              idempotencyKey: row.id,
              timeoutMs,
            });
    outcome = result ?? deliveryFailure('provider_failed', true);
  } catch {
    outcome = { ...deliveryFailure('provider_failed', true), ambiguous: true };
  }
  await finish(outcome, prepared.locale, transport);
  return true;
}

async function run(
  authority: TenantAuthority,
  deps: DeliveryDependencies,
  timing: Timing,
  ids?: readonly string[]
) {
  const { tenantId } = readTenantAuthority(authority);
  const now = deps.now ?? Date.now;
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
