import { test as base } from '@playwright/test';

const CLEANUP_RESERVE_MS = 30_000;
const UNLIMITED_TEST_SIGNAL_TIMEOUT_MS = 30_000;

type SignalOperation<T> = (remaining: () => number) => Promise<T>;

export type WaitForSignal = <T>(
  phase: string,
  signal: Promise<T> | SignalOperation<T>
) => Promise<T>;

export function createSignal<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export async function withSignalTimeout<T>(
  phase: string,
  timeout: number,
  signal: Promise<T> | SignalOperation<T>
): Promise<T> {
  const deadline = performance.now() + timeout;
  const expired = () => new Error(`${phase} timed out`);
  const remaining = () => {
    const time = Math.ceil(deadline - performance.now());
    if (time <= 0) throw expired();
    return time;
  };

  if (timeout <= 0) {
    if (typeof signal !== 'function') void signal.catch(() => undefined);
    throw expired();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutSignal = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(expired()), Math.ceil(timeout));
  });
  try {
    const operation = Promise.resolve().then(() =>
      typeof signal === 'function' ? signal(remaining) : signal
    );
    return await Promise.race([timeoutSignal, operation]);
  } finally {
    clearTimeout(timer);
  }
}

export const signalTest = base.extend<{ waitForSignal: WaitForSignal }>({
  waitForSignal: [
    async ({}, use, info) => {
      // Playwright exposes the timeout setting, but not the running slot's remaining time.
      // Approximate it from early fixture setup, leaving time for cleanup.
      const startedAt = performance.now();
      await use((phase, signal) =>
        base.step(phase, () =>
          withSignalTimeout(
            phase,
            info.timeout === 0
              ? UNLIMITED_TEST_SIGNAL_TIMEOUT_MS
              : startedAt + info.timeout - CLEANUP_RESERVE_MS - performance.now(),
            signal
          )
        )
      );
    },
    { auto: true },
  ],
});
