import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { SEARCH_COMMIT_DELAY_MS, useResponsiveSearch } from './use-responsive-search';

// Router free harness: the shared policy is exercised through its adapter
// config, so these concurrency regressions stay reusable for every family.
export const navigate = vi.fn();

type HarnessProps = { readonly query?: string; readonly initialDraft?: string };

export function Harness({ query = '', initialDraft }: HarnessProps) {
  const [lastRequest, setLastRequest] = useState('none');
  const {
    draft,
    pendingKind,
    isNavigationPending,
    editDraft,
    requestNavigation,
    cancelScheduledSearch,
    getPendingKind,
  } = useResponsiveSearch({
    searchParams: new URLSearchParams(query),
    pathname: '/agent/members',
    searchKey: 'q',
    initialDraft,
    normalizeTerm: value => value.trim(),
    navigate,
  });

  return (
    <div
      data-testid="region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
      data-pending={pendingKind ?? 'none'}
    >
      <input data-testid="input" value={draft} onChange={event => editDraft(event.target.value)} />
      <button
        type="button"
        data-testid="guarded-filter"
        onClick={() => {
          if (getPendingKind()) return;
          requestNavigation({ view: 'active' }, 'filter');
        }}
      >
        filter
      </button>
      <button
        type="button"
        data-testid="direct-filter"
        onClick={() => requestNavigation({ view: 'active' }, 'filter')}
      >
        direct filter
      </button>
      <button
        type="button"
        data-testid="noop-request"
        onClick={() => setLastRequest(String(requestNavigation({}, 'filter')))}
      >
        noop
      </button>
      <button type="button" data-testid="cancel" onClick={() => cancelScheduledSearch()}>
        cancel
      </button>
      <button type="button" data-testid="settle" onClick={() => cancelScheduledSearch(null)}>
        settle
      </button>
      <span data-testid="last-request">{lastRequest}</span>
    </div>
  );
}

export function input(): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>('input');
}

export function typeDraft(value: string): void {
  fireEvent.change(input(), { target: { value } });
}

export function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

export function settle(): void {
  advance(SEARCH_COMMIT_DELAY_MS);
}

export function pendingKind(): string | null {
  return screen.getByTestId('region').dataset.pending ?? null;
}

export function navigated(): string[] {
  return navigate.mock.calls.map(call => String(call[0]));
}

// The browser fires popstate before the router exposes the destination.
export function popToPath(path: string, query = ''): void {
  window.history.replaceState(null, '', query ? `${path}?${query}` : path);
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
}

export function popTo(query: string): void {
  popToPath('/agent/members', query);
}

/** Fake timers, a clean navigate spy and a clean url for every case. */
export function setupSearchHarness(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    window.history.replaceState(null, '', '/agent/members');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
}
