import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResponsiveSearch } from './use-responsive-search';

const navigate = vi.fn();
function mount(query = '', initialDraft?: string) {
  return renderHook(
    ({ query, initialDraft }) =>
      useResponsiveSearch({
        searchParams: new URLSearchParams(query),
        pathname: '/agent/members',
        searchKey: 'q',
        initialDraft,
        normalizeTerm: value => value.trim(),
        navigate,
      }),
    { initialProps: { query, initialDraft } }
  );
}
function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

describe('responsive search navigation ownership regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    window.history.replaceState(null, '', '/agent/members');
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('restores search feedback when a late echo requires convergence after recovery', () => {
    const { result, rerender } = mount();
    act(() => result.current.editDraft('A'));
    advance(250);
    act(() => result.current.editDraft(''));
    advance(10_000);
    expect(result.current.pendingKind).toBeNull();
    rerender({ query: 'q=A', initialDraft: undefined });
    expect(result.current.draft).toBe('');
    expect(result.current.pendingKind).toBe('search');
  });

  it('a direct filter navigation cancels any queued search before it can supersede the filter', () => {
    const { result } = mount();
    act(() => result.current.editDraft('A'));
    advance(100);
    act(() => result.current.requestNavigation({ view: 'active' }, 'filter'));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('view=active');
    advance(250);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('a newer explicit search navigation renews recovery even when the draft is unchanged', () => {
    const { result } = mount();
    act(() => result.current.editDraft('A'));
    advance(250);
    advance(9_650);
    act(() => result.current.requestNavigation({ q: 'B' }, 'search'));
    advance(100);
    expect(result.current.pendingKind).toBe('search');
    advance(9_900);
    expect(result.current.pendingKind).toBeNull();
  });

  it('the committed URL takes precedence over a stale server draft seed', () => {
    const { result } = mount('q=current', 'stale');
    expect(result.current.draft).toBe('current');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Back to a different pathname blocks edits through the old adapter until adoption', () => {
    const { result } = mount();
    act(() => result.current.editDraft('A'));
    window.history.replaceState(null, '', '/agent/clients');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.pendingKind).toBe('filter');
    act(() => result.current.editDraft('new page'));
    advance(250);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('filter destination adoption never resurrects the cancelled draft', () => {
    const { result, rerender } = mount();
    act(() => result.current.editDraft('A'));
    advance(100);
    act(() => result.current.requestNavigation({ view: 'active' }, 'filter'));
    rerender({ query: 'view=active', initialDraft: undefined });
    expect(result.current.draft).toBe('');
    expect(result.current.pendingKind).toBeNull();
    advance(250);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('view=active');
  });

  it('an already queued recovery callback cannot clear newer navigation ownership', () => {
    const { result } = mount();
    act(() => result.current.editDraft('A'));
    advance(250);
    advance(9_900);
    act(() => {
      result.current.requestNavigation({ q: 'B' }, 'search');
      // The old deadline fires before React has reconnected effect cleanup.
      vi.advanceTimersByTime(100);
    });
    expect(result.current.pendingKind).toBe('search');
  });

  it.each([0, 250])(
    'an older filter echo preserves a later search accepted after recovery (%i ms)',
    elapsed => {
      const { result, rerender } = mount('q=old');
      act(() => result.current.requestNavigation({ view: 'active' }, 'filter'));
      advance(10_000);
      expect(result.current.pendingKind).toBeNull();
      act(() => result.current.editDraft('B'));
      advance(elapsed);
      rerender({ query: 'q=old&view=active', initialDraft: undefined });
      expect(result.current.draft).toBe('B');
      expect(result.current.pendingKind).toBe('search');
      advance(250);
      expect(navigate.mock.calls.at(-1)?.[0]).toContain('q=B');
    }
  );

  it('the latest filter still adopts after feedback recovery without newer search intent', () => {
    const { result, rerender } = mount('q=old');
    act(() => result.current.editDraft('abandoned'));
    advance(100);
    act(() => result.current.requestNavigation({ view: 'active' }, 'filter'));
    advance(10_000);
    expect(result.current.pendingKind).toBeNull();
    rerender({ query: 'q=old&view=active', initialDraft: undefined });
    expect(result.current.draft).toBe('old');
    expect(result.current.pendingKind).toBeNull();
    advance(250);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('q=old&view=active');
  });
});
