import { test as base } from '@playwright/test';

const CLEANUP_RESERVE_MS = 30_000;

export type WaitForSignal = <T>(phase: string, signal: Promise<T>) => Promise<T>;

export function createSignal<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export const signalTest = base.extend<{ waitForSignal: WaitForSignal }>({
  waitForSignal: [
    async ({}, use, info) => {
      // Start before page and auth setup. Callers may set the test timeout after setup.
      const startedAt = performance.now();
      await use((phase, signal) =>
        base.step(phase, async () => {
          const remaining = startedAt + info.timeout - CLEANUP_RESERVE_MS - performance.now();
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<never>((_, reject) => {
            const expire = () => reject(new Error(`${phase} timed out before cleanup`));
            if (remaining <= 0) expire();
            else timer = setTimeout(expire, remaining);
          });
          try {
            return await Promise.race([timeout, signal]);
          } finally {
            clearTimeout(timer);
          }
        })
      );
    },
    { auto: true },
  ],
});
