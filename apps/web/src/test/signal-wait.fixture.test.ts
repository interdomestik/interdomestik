import { afterEach, expect, it, vi } from 'vitest';
import { createSignal, withSignalTimeout } from '../../e2e/gate/signal-wait.fixture';

afterEach(() => vi.useRealTimers());

it('does not start a browser action when the phase budget is exhausted', async () => {
  const trigger = vi.fn(async () => undefined);

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
