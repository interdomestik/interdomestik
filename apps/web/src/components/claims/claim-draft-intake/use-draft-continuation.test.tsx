import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSavedDraftContinuation,
  savedDraftContinuationHref,
} from '@/lib/saved-draft-continuation';
import { useDraftContinuation } from './use-draft-continuation';

const id = '63ffc31e-8c64-4758-995a-c57f40de7568';
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('exact saved draft continuation', () => {
  it.each(['en', 'sq', 'mk', 'sr'])(
    'keeps %s on the existing query contract with only an opaque fragment',
    locale => {
      expect(savedDraftContinuationHref(locale, id)).toBe(
        `/${locale}/member/claims/new?mode=drafts#draft=${id}`
      );
    }
  );
  it.each(['bad', `${id}&other=1`, `${id}/extra`, encodeURIComponent(`${id} `)])(
    'rejects malformed selection %s',
    value => {
      expect(readSavedDraftContinuation(`#draft=${value}`)).toBeNull();
      expect(savedDraftContinuationHref('en', value)).toBeNull();
    }
  );
  it('has no read or storage side effect without a selection', () => {
    const resume = vi.fn();
    const { result } = renderHook(() => useDraftContinuation(resume));
    expect(result.current.blocked).toBe(false);
    expect(resume).not.toHaveBeenCalled();
    expect(savedDraftContinuationHref('de', id)).toBeNull();
  });
  it('blocks editing until the exact read succeeds, once under StrictMode', async () => {
    window.history.replaceState(null, '', `/#draft=${id}`);
    let finish!: (value: boolean) => void;
    const resume = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve;
        })
    );
    const { result, rerender } = renderHook(() => useDraftContinuation(resume), {
      wrapper: StrictMode,
    });
    expect(result.current.blocked).toBe(true);
    expect(resume).toHaveBeenCalledExactlyOnceWith(id);
    rerender();
    await act(async () => {
      finish(true);
    });
    expect(result.current.blocked).toBe(false);
    window.history.replaceState(null, '', '/#draft=a1ff9e4e-63f9-4fd3-9d79-965f7e5e401a');
    rerender();
    expect(resume).toHaveBeenCalledTimes(1);
  });
  it.each([false, undefined])(
    'keeps refused or busy reads blocked (%s) and supports an explicit retry',
    async refused => {
      window.history.replaceState(null, '', `/#draft=${id}`);
      const resume = vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce(true);
      const { result } = renderHook(() => useDraftContinuation(resume));
      await waitFor(() => expect(result.current.state).toBe('error'));
      expect(result.current.blocked).toBe(true);
      await act(() => result.current.retry());
      expect(result.current.blocked).toBe(false);
      expect(resume.mock.calls).toEqual([[id], [id]]);
    }
  );
  it('rejects an invalid fragment without reading any draft', () => {
    window.history.replaceState(null, '', '/#draft=bad');
    const resume = vi.fn();
    const { result } = renderHook(() => useDraftContinuation(resume));
    expect(result.current.state).toBe('error');
    expect(result.current.canRetry).toBe(false);
    expect(resume).not.toHaveBeenCalled();
  });
});
