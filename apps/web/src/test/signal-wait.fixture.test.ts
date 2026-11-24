import { afterEach, expect, it, vi } from 'vitest';
import {
  createSignal,
  withSignalTimeout,
  type WaitForSignal,
} from '../../e2e/gate/signal-wait.fixture';

type FixtureInfo = { timeout: number; _deadline: () => { deadline: number } };
type SetupWaitForSignal = (
  params: object,
  use: (wait: WaitForSignal) => Promise<void>,
  info: FixtureInfo
) => Promise<void>;

const { setupWaitForSignal } = vi.hoisted(() => ({
  setupWaitForSignal: vi.fn<SetupWaitForSignal>(),
}));

vi.mock('@playwright/test', () => ({
  test: {
    extend: ({ waitForSignal }: { waitForSignal: [SetupWaitForSignal, { auto: boolean }] }) => {
      setupWaitForSignal.mockImplementation(waitForSignal[0]);
    },
    step: (_title: string, run: () => Promise<unknown>) => run(),
  },
}));

afterEach(() => vi.useRealTimers());

it('honors the active Playwright deadline when setup used part of the test budget', async () => {
  const trigger = vi.fn(() => Promise.resolve());
  const info = { timeout: 60_000, _deadline: () => ({ deadline: 25_000 }) };

  await setupWaitForSignal(
    {},
    async wait => {
      await expect(wait('Open after prior setup', trigger)).rejects.toThrow(
        'Open after prior setup timed out'
      );
    },
    info
  );
  expect(trigger).not.toHaveBeenCalled();
});

it('does not start a browser action when the phase budget is exhausted', async () => {
  const trigger = vi.fn(() => Promise.resolve());

  await expect(withSignalTimeout('Open staff history', 0, trigger)).rejects.toThrow(
    'Open staff history timed out'
  );
  expect(trigger).not.toHaveBeenCalled();
});

it('gives the trigger and completion check the same deadline', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const triggered = createSignal<void>();
  const complete = createSignal<void>();
  const check = vi.fn();
  const wait = withSignalTimeout('Complete messaging send', 5_000, async remaining => {
    expect(remaining()).toBe(5_000);
    await triggered.promise;
    check(remaining());
    await complete.promise;
  });
  const failure = expect(wait).rejects.toThrow('Complete messaging send timed out');

  await vi.advanceTimersByTimeAsync(4_000);
  triggered.resolve();
  await vi.advanceTimersByTimeAsync(1_000);

  await failure;
  expect(check).toHaveBeenCalledExactlyOnceWith(1_000);
  complete.resolve();
});

it('clears the deadline after the operation succeeds', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await expect(
    withSignalTimeout('Read staff history', 5_000, Promise.resolve('ready'))
  ).resolves.toBe('ready');
  expect(vi.getTimerCount()).toBe(0);
});
