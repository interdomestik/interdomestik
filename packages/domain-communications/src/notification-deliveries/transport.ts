import type { DeliveryFailure } from '../delivery-outcome';
import type { EmailTransport } from '../email';
import type { ClaimedDelivery, Delivery, DeliveryTransport } from './types';

export function chooseTransport(
  row: Delivery,
  configured: readonly EmailTransport[]
): DeliveryTransport | null {
  if (row.channel === 'push')
    return !row.transport || row.transport === 'webpush' ? 'webpush' : null;
  if (row.transport) {
    return row.transport !== 'webpush' && configured.includes(row.transport) ? row.transport : null;
  }
  const preferred = row.avoidTransport === 'smtp' ? 'resend' : 'smtp';
  return configured.includes(preferred) ? preferred : (configured[0] ?? null);
}

export function deliveryFailure(code: string, retryable: boolean): DeliveryFailure {
  return { ok: false, retryable, ambiguous: false, preAcceptance: false, code, detail: code };
}

export function failureTransition(
  row: ClaimedDelivery,
  failure: DeliveryFailure,
  transport: DeliveryTransport | null,
  configured: readonly EmailTransport[]
) {
  const refused =
    !row.transport && transport && transport !== 'webpush' && failure.preAcceptance
      ? transport
      : null;
  const hasAlternate = refused !== null && configured.some(item => item !== refused);
  const retry = row.attempts < 8 && (failure.retryable || hasAlternate);
  const delayMs =
    hasAlternate && !row.avoidTransport
      ? 0
      : Math.min(86_400_000, 900_000 * 2 ** (row.attempts - 1));

  return {
    retry,
    delayMs,
    transport: refused ? null : (transport ?? row.transport),
    avoidTransport: refused ?? row.avoidTransport,
  };
}
