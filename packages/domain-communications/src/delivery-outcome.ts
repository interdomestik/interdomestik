export type DeliveryFailure = {
  ok: false;
  retryable: boolean;
  ambiguous: boolean;
  preAcceptance: boolean;
  code: string;
  detail: string;
};

export type DeliveryOutcome<Transport extends 'smtp' | 'resend' | 'webpush'> =
  { ok: true; transport: Transport } | DeliveryFailure;

export class DeliveryTimeout extends Error {}

export async function withDeliveryTimeout<T>(
  timeoutMs: number,
  send: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new DeliveryTimeout();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new DeliveryTimeout();
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    return await Promise.race([timeout, send(controller.signal)]);
  } finally {
    clearTimeout(timer);
  }
}

export function providerField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null
    ? Object.getOwnPropertyDescriptor(error, field)?.value
    : undefined;
}

export function providerStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}
