import { randomUUID } from 'node:crypto';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { sendEmailOutcome } from '@interdomestik/domain-communications/email';
import {
  authorizeVerifiedRecipientInTx,
  captureVerifiedRecipientInTx,
} from '@interdomestik/domain-communications/recipient-locale';

import {
  gateInTx,
  lockDeliveryInTx,
  lockEligiblePeriodInTx,
  saveDeliveryInTx,
} from './delivery-queries';
import type {
  ClaimedExpiryDelivery,
  ExpiryAuthorization,
  ExpiryDeliveryKey,
  ExpiryDeliveryOptions,
  ExpiryDeliveryRecord,
  ExpiryDeliveryState,
} from './types';

export type {
  ClaimedExpiryDelivery,
  ExpiryAuthorization,
  ExpiryDeliveryKey,
  ExpiryDeliveryOptions,
  ExpiryDeliveryRecord,
  ExpiryDeliveryState,
} from './types';

type SuccessfulClaim = {
  readonly ok: true;
  readonly claim: {
    readonly periodId: ClaimedExpiryDelivery['periodId'];
    readonly leaseToken: ReturnType<typeof randomUUID>;
    readonly handle: ClaimedExpiryDelivery['handle'];
  };
};

const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;
const INITIAL_BACKOFF_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 86_400_000;

function refusal<Code extends string>(code: Code) {
  return { ok: false, code } as const;
}

function beforeSendFailure(code: 'transport_deadline_elapsed' | 'render_failed') {
  return { ...refusal(code), detail: code, retryable: true, ambiguous: false, preAcceptance: true };
}

function deliveryKey(authority: TenantAuthority, periodId: string): ExpiryDeliveryKey | null {
  try {
    const { tenantId, accessTenantId, purpose, principal } = readTenantAuthority(authority);
    if (purpose === 'scheduled-work' && principal === null && tenantId === accessTenantId) {
      return { tenantId, periodId };
    }
    return null;
  } catch {
    return null;
  }
}

function matchesKey(
  row: ExpiryDeliveryRecord | null,
  key: ExpiryDeliveryKey
): row is ExpiryDeliveryRecord {
  return row !== null && row.tenantId === key.tenantId && row.periodId === key.periodId;
}

function failureState(
  attempts: number,
  now: number,
  code: string,
  retryable = true
): ExpiryDeliveryState {
  const retry = retryable && attempts < MAX_ATTEMPTS;
  const delay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** (attempts - 1));
  return {
    state: retry ? 'queued' : 'failed',
    attempts,
    nextAttemptAt: retry ? now + delay : null,
    terminalAt: retry ? null : now,
    lease: null,
    authorization: null,
    code,
  };
}

export function createExpiryDeliveryWorker(options: ExpiryDeliveryOptions) {
  const { transport, timeoutMs, finishReserveMs, render, now = Date.now } = options;
  if (![timeoutMs, finishReserveMs].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Invalid expiry delivery timeout');
  }

  async function claim(authority: TenantAuthority, periodId: string) {
    const key = deliveryKey(authority, periodId);
    if (!key) return refusal('recipient_missing');

    try {
      return await withTenantAuthority(authority, async tx => {
        if (!(await gateInTx(tx, key.tenantId))) return refusal('gate_closed');
        const period = await lockEligiblePeriodInTx(tx, key);
        if (!period) return refusal('period_unavailable');
        const leaseToken = randomUUID();
        const recipient = period.memberId
          ? await captureVerifiedRecipientInTx(tx, authority, period.memberId, leaseToken)
          : refusal('recipient_missing');
        const locked = await lockDeliveryInTx(tx, key);
        if (!matchesKey(locked, key)) return refusal('lease_unavailable');
        const row = locked.metadata;
        if (row.authorization !== null) return refusal('reconciliation_required');

        const mark = now();
        const due =
          row.state === 'queued' && row.nextAttemptAt !== null && row.nextAttemptAt <= mark;
        const abandoned =
          row.state === 'claimed' && row.lease !== null && row.lease.expiresAt <= mark;
        if (!due && !abandoned) return refusal('lease_unavailable');

        const attempts = row.attempts + 1;
        if (row.attempts >= MAX_ATTEMPTS || !recipient.ok) {
          const code =
            recipient.ok || row.attempts >= MAX_ATTEMPTS ? 'lease_expired' : recipient.code;
          const changed = await saveDeliveryInTx(
            tx,
            locked,
            failureState(Math.min(attempts, MAX_ATTEMPTS), mark, code)
          );
          return changed ? refusal(code) : refusal('lease_lost');
        }

        const changed = await saveDeliveryInTx(tx, locked, {
          state: 'claimed',
          attempts,
          nextAttemptAt: null,
          terminalAt: null,
          lease: { token: leaseToken, expiresAt: mark + LEASE_MS },
          authorization: null,
          code: null,
        });
        if (!changed) return refusal('lease_lost');
        const result: SuccessfulClaim = {
          ok: true,
          claim: { periodId, leaseToken, handle: recipient.handle },
        };
        return result;
      });
    } catch {
      return refusal('expiry_operational_failure');
    }
  }

  function authorize(
    authority: TenantAuthority,
    key: ExpiryDeliveryKey,
    claim: ClaimedExpiryDelivery
  ) {
    return withTenantAuthority(authority, async tx => {
      if (!(await gateInTx(tx, key.tenantId))) return refusal('gate_closed');
      const period = await lockEligiblePeriodInTx(tx, key);
      if (!period) return refusal('period_unavailable');
      const recipient = period.memberId
        ? await authorizeVerifiedRecipientInTx(
            tx,
            authority,
            period.memberId,
            claim.leaseToken,
            claim.handle
          )
        : refusal('recipient_missing');

      const locked = await lockDeliveryInTx(tx, key);
      if (!matchesKey(locked, key)) return refusal('lease_lost');
      const row = locked.metadata;
      const mark = now();
      if (row.state !== 'claimed' || !row.lease) return refusal('lease_lost');
      if (row.lease.token !== claim.leaseToken || row.lease.expiresAt <= mark) {
        return refusal('lease_lost');
      }
      if (row.authorization !== null) return refusal('authorization_exists');
      const transportDeadline = Math.min(mark + timeoutMs, row.lease.expiresAt - finishReserveMs);
      if (!recipient.ok || transportDeadline <= mark) {
        const code = recipient.ok ? 'transport_deadline_elapsed' : recipient.code;
        const changed = await saveDeliveryInTx(tx, locked, failureState(row.attempts, mark, code));
        return changed ? refusal(code) : refusal('lease_lost');
      }

      const authorization = { leaseToken: claim.leaseToken, authorizedAt: mark, transportDeadline };
      const changed = await saveDeliveryInTx(tx, locked, { ...row, authorization });
      if (!changed) return refusal('lease_lost');
      return {
        ok: true,
        recipient: recipient.recipient,
        authorization,
        reference: locked.reference,
      } as const;
    });
  }

  async function finish(
    authority: TenantAuthority,
    key: ExpiryDeliveryKey,
    expected: ExpiryAuthorization,
    outcome: Awaited<ReturnType<typeof sendEmailOutcome>>
  ) {
    return withTenantAuthority(authority, async tx => {
      const locked = await lockDeliveryInTx(tx, key);
      if (!matchesKey(locked, key)) return refusal('lease_lost');
      const row = locked.metadata;
      if (
        row.state !== 'claimed' ||
        row.lease?.token !== expected.leaseToken ||
        row.authorization?.leaseToken !== expected.leaseToken ||
        row.authorization.authorizedAt !== expected.authorizedAt ||
        row.authorization.transportDeadline !== expected.transportDeadline
      ) {
        return refusal('lease_lost');
      }

      const mark = now();
      let next: ExpiryDeliveryState;
      if (outcome.ok) {
        next = {
          ...row,
          state: 'sent',
          lease: null,
          authorization: null,
          terminalAt: mark,
          code: null,
        };
      } else if (outcome.ambiguous) {
        next = { ...row, code: outcome.code };
      } else {
        next = failureState(row.attempts, mark, outcome.code, outcome.retryable);
      }
      if (!(await saveDeliveryInTx(tx, locked, next))) return refusal('lease_lost');
      return outcome.ok ? ({ ok: true, state: 'sent' } as const) : refusal(outcome.code);
    });
  }

  async function dispatch(authority: TenantAuthority, claim: ClaimedExpiryDelivery) {
    const key = deliveryKey(authority, claim.periodId);
    if (!key) return refusal('recipient_missing');

    try {
      const committed = await authorize(authority, key, claim);
      if (!committed.ok) return committed;

      const { authorization, recipient, reference } = committed;
      if (now() >= authorization.transportDeadline) {
        return await finish(
          authority,
          key,
          authorization,
          beforeSendFailure('transport_deadline_elapsed')
        );
      }
      const verifiedEmail = recipient.email;
      let message: ReturnType<ExpiryDeliveryOptions['render']>;
      try {
        message = render(key.periodId, recipient);
      } catch {
        return await finish(authority, key, authorization, beforeSendFailure('render_failed'));
      }
      const remaining = authorization.transportDeadline - now();
      const outcome =
        remaining > 0
          ? await sendEmailOutcome(transport, verifiedEmail, message, {
              idempotencyKey: reference,
              timeoutMs: remaining,
            })
          : beforeSendFailure('transport_deadline_elapsed');
      return await finish(authority, key, authorization, outcome);
    } catch {
      // An unconfirmed authorization stops before handoff. A failed finish leaves the drain intact.
      return refusal('expiry_operational_failure');
    }
  }

  return { claim, dispatch };
}
