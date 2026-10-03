import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  advance,
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

describe('verification search commits', () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it('coalesces a burst into one navigation, 250ms after the last keystroke', () => {
    renderClient();

    typeSearch('a');
    advance(100);
    typeSearch('an');
    advance(100);
    typeSearch('ana');

    advance(249);
    expect(replaceCalls()).toHaveLength(0);

    advance(1);
    expect(replaceCalls()).toHaveLength(1);
    const [url, options] = lastReplace();
    expect(queryOf(url).get('query')).toBe('ana');
    // Search navigation uses the router default scroll behaviour.
    expect(options).toBeUndefined();
  });

  it('shows the draft immediately, before anything is committed', () => {
    renderClient();

    typeSearch('an');

    expect(searchInput().value).toBe('an');
    expect(replaceCalls()).toHaveLength(0);
  });

  it('commits the raw term, keeping surrounding whitespace', () => {
    renderClient();

    typeSearch('  ana  ');
    advance(250);

    expect(queryOf(lastReplace()[0]).get('query')).toBe('  ana  ');
  });

  it('treats "all" as a literal search term, not a sentinel', () => {
    renderClient();

    typeSearch('all');
    advance(250);

    expect(queryOf(lastReplace()[0]).get('query')).toBe('all');
  });

  it('deletes the query param when the draft is cleared', () => {
    renderClient({ search: 'query=ana&page=2' });

    typeSearch('');
    advance(250);

    const params = queryOf(lastReplace()[0]);
    expect(params.has('query')).toBe(false);
    expect(params.get('page')).toBe('2');
  });

  it('does not navigate when the typed term already matches the url', () => {
    renderClient({ search: 'query=ana' });

    typeSearch('ana');
    advance(250);

    expect(replaceCalls()).toHaveLength(0);
    expect(hasPendingLabel()).toBe(false);
  });

  it('preserves unrelated, repeated and ops params and never resets page or view', () => {
    renderClient({ search: 'tenant=t1&page=3&view=history&selected=attempt-1&tag=x&tag=y' });

    typeSearch('ana');
    advance(250);

    const params = queryOf(lastReplace()[0]);
    expect(params.get('query')).toBe('ana');
    expect(params.get('tenant')).toBe('t1');
    expect(params.get('page')).toBe('3');
    expect(params.get('view')).toBe('history');
    expect(params.get('selected')).toBe('attempt-1');
    expect(params.getAll('tag')).toEqual(['x', 'y']);
  });

  it('keeps the input editable while a search is outstanding and converges on the newest term', () => {
    const harness = renderClient();

    typeSearch('a');
    advance(250);
    expect(replaceCalls()).toHaveLength(1);
    expect(searchInput().disabled).toBe(false);

    // B is typed while A is still in flight: the draft must not be reverted.
    typeSearch('ab');
    expect(searchInput().value).toBe('ab');

    // A's echo lands late: it is obsolete, so B survives it.
    harness.commitLastNavigation();
    expect(searchInput().value).toBe('ab');

    advance(250);
    expect(replaceCalls()).toHaveLength(2);
    expect(queryOf(lastReplace()[0]).get('query')).toBe('ab');

    // B's echo converges: no further navigation, draft and url agree.
    harness.commitLastNavigation();
    advance(250);
    expect(replaceCalls()).toHaveLength(2);
    expect(searchInput().value).toBe('ab');
    expect(hasPendingLabel()).toBe(false);
  });

  it('adopts a subsequent authoritative URL after the latest search settled', () => {
    const harness = renderClient();

    typeSearch('a');
    advance(250);
    const [firstUrl] = lastReplace();

    typeSearch('ab');
    advance(250);
    expect(replaceCalls()).toHaveLength(2);
    harness.commitLastNavigation();

    // Once the latest navigation settles, a subsequent URL publication is
    // authoritative external navigation (for example Back), not an outstanding echo.
    harness.navigateTo(queryOf(firstUrl).toString());
    expect(searchInput().value).toBe('a');
    advance(250);
    expect(replaceCalls()).toHaveLength(2);
  });

  it('keeps B while issued A publishes before B acknowledgement', () => {
    const harness = renderClient();
    typeSearch('a');
    advance(250);
    const first = lastReplace()[0];
    typeSearch('ab');
    advance(250);
    const second = lastReplace()[0];
    harness.navigateTo(queryOf(first).toString());
    expect(searchInput().value).toBe('ab');
    expect(isBusy()).toBe(true);
    expect(replaceCalls()).toHaveLength(2);
    harness.navigateTo(queryOf(second).toString());
    expect(searchInput().value).toBe('ab');
    expect(isBusy()).toBe(false);
  });

  it('reports pending search through the shared loading label without disabling the input', () => {
    renderClient();

    typeSearch('ana');

    expect(isBusy()).toBe(true);
    expect(hasPendingLabel()).toBe(true);
    expect(searchInput().disabled).toBe(false);
  });
});
