import { test as base, type TestInfo } from '@playwright/test';
import { createRequire } from 'node:module';

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

function signalBudget(info: TestInfo): number {
  if (info.timeout === 0) return UNLIMITED_TEST_SIGNAL_TIMEOUT_MS;

  // Playwright's matcher deadline uses the active timeout slot and its runner-aligned clock.
  // Both are internal in 1.63. Resolve the clock from the same installation as the runner.
  const requireFromTest = createRequire(require.resolve('@playwright/test'));
  const requireFromPlaywright = createRequire(requireFromTest.resolve('playwright'));
  const { iso } = requireFromPlaywright('playwright-core/lib/coreBundle') as {
    iso: { monotonicTime(): number };
  };
  const { deadline } = (info as TestInfo & { _deadline(): { deadline: number } })._deadline();
  return Math.min(info.timeout, deadline - iso.monotonicTime()) - CLEANUP_RESERVE_MS;
}

export function waitForTestSignal<T>(
  info: TestInfo,
  phase: string,
  signal: Promise<T> | SignalOperation<T>
): Promise<T> {
  return base.step(phase, () => withSignalTimeout(phase, signalBudget(info), signal));
}

export const signalTest = base.extend<{ waitForSignal: WaitForSignal }>({
  waitForSignal: [
    async ({}, use, info) => {
      await use((phase, signal) => waitForTestSignal(info, phase, signal));
    },
    { auto: true },
  ],
});
