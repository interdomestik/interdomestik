import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  advance,
  clickTestId,
  hasPendingLabel,
  isBusy,
  lastReplace,
  queryOf,
  renderClient,
  replaceCalls,
  resetHarness,
  searchInput,
  teardownHarness,
  typeSearch,
} from './verification-search.test-support';

describe('verification search lifecycle', () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it('drops queued work and adopts the url when history moves first', () => {
    const harness = renderClient({ search: 'query=ana' });

    typeSearch('anax');
    harness.navigateTo('query=zoe');

    expect(searchInput().value).toBe('zoe');
    advance(250);
    expect(replaceCalls()).toHaveLength(0);
  });

  it('cancels on popstate before router params publish and adopts the actual destination', () => {
    const harness = renderClient({ search: 'query=ana' });
    typeSearch('obsolete');
    act(() => {
      window.history.replaceState(null, '', '/admin/leads?query=zoe');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(searchInput().value).toBe('zoe');
    advance(250);
    expect(replaceCalls()).toHaveLength(0);
    harness.navigateTo('query=zoe');
    expect(searchInput().value).toBe('zoe');
  });

  it('does not resurrect cancelled work when the route is retained and revealed', () => {
    const harness = renderClient({ search: 'query=ana' });
    typeSearch('obsolete');
    clickTestId('sibling-link');
    harness.setActivityMode('hidden');
    advance(250);
    harness.setActivityMode('visible');
    advance(250);
    expect(replaceCalls()).toHaveLength(0);
    expect(searchInput().value).toBe('ana');
    expect(hasPendingLabel()).toBe(false);
  });

  it('switches view during a queued search, keeping the committed query and dropping selection', () => {
    const harness = renderClient({ search: 'query=ana&selected=attempt-1' });

    typeSearch('anax');
    clickTestId('view-history');

    expect(replaceCalls()).toHaveLength(1);
    const [url, options] = lastReplace();
    const params = queryOf(url);
    expect(params.get('view')).toBe('history');
    expect(params.get('query')).toBe('ana');
    expect(params.has('selected')).toBe(false);
    // View navigation uses the router default scroll behaviour.
    expect(options).toBeUndefined();
    // The real filter navigation blocks the input, which search never does.
    expect(searchInput().disabled).toBe(true);

    advance(250);
    expect(replaceCalls()).toHaveLength(1);

    harness.commitLastNavigation();
    expect(searchInput().value).toBe('ana');
    expect(searchInput().disabled).toBe(false);
  });

  it('ignores a click on the already active view and keeps the queued search', () => {
    renderClient();

    typeSearch('ana');
    clickTestId('view-queue');

    expect(replaceCalls()).toHaveLength(0);
    advance(250);
    expect(replaceCalls()).toHaveLength(1);
    expect(queryOf(lastReplace()[0]).get('query')).toBe('ana');
  });

  it('cancels queued work when a row is selected programmatically', () => {
    renderClient({ search: 'query=ana' });

    typeSearch('anax');
    clickTestId('row-select-attempt-1');

    expect(replaceCalls()).toHaveLength(1);
    const [url, options] = lastReplace();
    const params = queryOf(url);
    expect(params.get('selected')).toBe('attempt-1');
    expect(params.get('query')).toBe('ana');
    expect(options).toEqual({ scroll: false });

    advance(250);
    expect(replaceCalls()).toHaveLength(1);
    expect(searchInput().value).toBe('ana');
    expect(hasPendingLabel()).toBe(false);
  });

  it('cancels queued work when the drawer closes', () => {
    renderClient({ search: 'query=ana&selected=attempt-1' });

    typeSearch('anax');
    clickTestId('drawer-close');

    expect(replaceCalls()).toHaveLength(1);
    const [url, options] = lastReplace();
    const params = queryOf(url);
    expect(params.has('selected')).toBe(false);
    expect(params.get('query')).toBe('ana');
    expect(options).toEqual({ scroll: false });

    advance(250);
    expect(replaceCalls()).toHaveLength(1);
  });

  it('cancels queued work on a real sibling link click', () => {
    renderClient();

    typeSearch('ana');
    clickTestId('sibling-link');

    advance(250);
    expect(replaceCalls()).toHaveLength(0);
  });

  it('keeps queued work for modifier, external and self-managed links', () => {
    renderClient();

    typeSearch('ana');
    clickTestId('sibling-link', { metaKey: true });
    clickTestId('external-link');
    clickTestId('manual-link');

    advance(250);
    expect(replaceCalls()).toHaveLength(1);
    expect(queryOf(lastReplace()[0]).get('query')).toBe('ana');
  });

  it('never navigates after unmount', () => {
    const harness = renderClient();

    typeSearch('ana');
    harness.unmount();
    advance(250);

    expect(replaceCalls()).toHaveLength(0);
  });

  it('still commits exactly once under StrictMode double effects', () => {
    renderClient({ strictMode: true });

    typeSearch('a');
    advance(100);
    typeSearch('ana');
    advance(250);

    expect(replaceCalls()).toHaveLength(1);
    expect(queryOf(lastReplace()[0]).get('query')).toBe('ana');
  });

  it('releases stuck feedback after the recovery timeout and still accepts a retry', () => {
    renderClient();

    typeSearch('ana');
    advance(250);
    expect(replaceCalls()).toHaveLength(1);
    expect(isBusy()).toBe(true);

    // No echo ever arrives: feedback is released rather than stuck forever.
    advance(10_000);
    expect(hasPendingLabel()).toBe(false);

    typeSearch('anax');
    advance(250);
    expect(replaceCalls()).toHaveLength(2);
    expect(queryOf(lastReplace()[0]).get('query')).toBe('anax');
  });

  it('keeps newer search feedback across the earlier edit timeout window', () => {
    renderClient();

    typeSearch('a');
    advance(9_999);
    typeSearch('ab');
    advance(1);

    // Normal effect cleanup cancels older timers; B keeps its own feedback.
    expect(isBusy()).toBe(true);
    expect(hasPendingLabel()).toBe(true);
  });
});
