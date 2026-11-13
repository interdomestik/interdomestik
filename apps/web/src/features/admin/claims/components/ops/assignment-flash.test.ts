import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSIGNMENT_TOAST_READ_MS,
  consumeAssignmentFlash,
  rememberAssignmentFlash,
  useDeferredAssignmentReload,
} from './assignment-flash';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  globalThis.sessionStorage.clear();
});

describe('assignment flash', () => {
  it('is consumed exactly once and only by the same claim', () => {
    expect(rememberAssignmentFlash('claim-1')).toBe(true);
    expect(consumeAssignmentFlash('claim-2')).toBe(false);
    expect(consumeAssignmentFlash('claim-1')).toBe(true);
    expect(consumeAssignmentFlash('claim-1')).toBe(false);
  });

  it('degrades to false when session storage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect(rememberAssignmentFlash('claim-1')).toBe(false);
    expect(consumeAssignmentFlash('claim-1')).toBe(false);
  });
});

describe('deferred assignment reload', () => {
  function setup() {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('location', { href: 'http://localhost/', reload });
    const hook = renderHook(({ claimId }) => useDeferredAssignmentReload(claimId), {
      initialProps: { claimId: 'claim-1' },
    });
    const settled = vi.fn();
    void hook.result.current().then(settled);
    return { hook, reload, settled };
  }

  it('stays pending until it reloads after the read delay', async () => {
    const { reload, settled } = setup();
    await vi.advanceTimersByTimeAsync(ASSIGNMENT_TOAST_READ_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it.each(['unmount', 'claim change'])('cancels the reload on %s', async trigger => {
    const { hook, reload, settled } = setup();
    if (trigger === 'unmount') hook.unmount();
    else hook.rerender({ claimId: 'claim-2' });
    await vi.advanceTimersByTimeAsync(ASSIGNMENT_TOAST_READ_MS * 2);
    expect(reload).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
