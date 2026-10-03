import { describe, expect, it } from 'vitest';
import {
  applyQueryUpdates,
  normalizeRoutePath,
  resolveInitialDraft,
  routeKey,
  searchUiReducer,
  type SearchUiState,
} from './responsive-search-policy';

describe('applyQueryUpdates', () => {
  it('writes values, deletes empty or null ones and keeps the rest of the query', () => {
    const params = new URLSearchParams('tenantId=tenant_ks&page=3&q=old&view=active');

    expect(applyQueryUpdates(params, { q: 'new', view: null, page: '' })).toBe(
      'tenantId=tenant_ks&q=new'
    );
  });

  it('never mutates the committed params it is given', () => {
    const params = new URLSearchParams('q=old');

    applyQueryUpdates(params, { q: 'new' });

    expect(params.toString()).toBe('q=old');
  });
});

describe('route identity', () => {
  it('strips a canonical locale prefix so both forms are the same route', () => {
    expect(normalizeRoutePath('/sq/agent/members')).toBe('/agent/members');
    expect(normalizeRoutePath('/en/agent/clients')).toBe('/agent/clients');
    expect(normalizeRoutePath('/sq')).toBe('/');
    expect(routeKey('/sq/agent/members', 'q=a')).toBe(routeKey('/agent/members', 'q=a'));
  });

  it('leaves paths that merely start with another segment alone', () => {
    expect(normalizeRoutePath('/agent/members')).toBe('/agent/members');
    expect(normalizeRoutePath('/english/agent')).toBe('/english/agent');
    expect(normalizeRoutePath('')).toBe('/');
  });

  it('separates routes that share a query', () => {
    expect(routeKey('/agent/members', 'q=a')).not.toBe(routeKey('/agent/clients', 'q=a'));
  });
});

describe('resolveInitialDraft', () => {
  it('prefers the committed term over a server resolved seed', () => {
    expect(resolveInitialDraft(new URLSearchParams('q=current'), 'q', 'stale')).toBe('current');
    expect(resolveInitialDraft(new URLSearchParams('q='), 'q', 'stale')).toBe('');
  });

  it('keeps the seed only while this family has no committed term', () => {
    expect(resolveInitialDraft(new URLSearchParams('view=active'), 'q', 'seed')).toBe('seed');
    expect(resolveInitialDraft(new URLSearchParams(), 'q', undefined)).toBe('');
  });
});

describe('searchUiReducer', () => {
  const base: SearchUiState = { pendingKind: 'search', pendingEpoch: 1, draft: 'ada' };

  it('renews the epoch for a newer owner of the same pending kind', () => {
    const renewed = searchUiReducer(base, {
      type: 'pending-changed',
      pendingKind: 'search',
      renew: true,
    });

    expect(renewed).not.toBe(base);
    expect(renewed.pendingEpoch).toBe(2);
    expect(renewed.pendingKind).toBe('search');
  });

  it('stays identical for a repeated pending kind without a new owner', () => {
    expect(searchUiReducer(base, { type: 'pending-changed', pendingKind: 'search' })).toBe(base);
  });

  it('needs no epoch for settling, and dedupes unchanged drafts', () => {
    const settled = { ...base, pendingKind: null };

    expect(
      searchUiReducer(settled, { type: 'pending-changed', pendingKind: null, renew: true })
    ).toBe(settled);
    expect(searchUiReducer(base, { type: 'draft-edited', draft: 'ada' })).toBe(base);
    expect(searchUiReducer(base, { type: 'draft-edited', draft: 'ada l' }).draft).toBe('ada l');
  });
});
