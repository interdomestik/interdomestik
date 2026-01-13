import { describe, expect, it } from 'vitest';
import { buildQueueUrl, isPoolDefiningParam } from './utils';

describe('isPoolDefiningParam', () => {
  it('identifies pool-defining parameters', () => {
    expect(isPoolDefiningParam('lifecycle')).toBe(true);
    expect(isPoolDefiningParam('branch')).toBe(true);
    expect(isPoolDefiningParam('assignee')).toBe(true);
    expect(isPoolDefiningParam('search')).toBe(true);
  });

  it('identifies non-pool-defining parameters', () => {
    expect(isPoolDefiningParam('priority')).toBe(false);
    expect(isPoolDefiningParam('page')).toBe(false);
    expect(isPoolDefiningParam('poolAnchor')).toBe(false);
    expect(isPoolDefiningParam('random')).toBe(false);
  });
});

describe('buildQueueUrl', () => {
  const basePath = '/en/admin/claims';

  it('preserves poolAnchor when changing priority (in-pool filter)', () => {
    const current = new URLSearchParams({
      lifecycle: 'intake',
      poolAnchor: 'timestamp-123',
      page: '2',
      priority: 'sla',
    });

    // Change priority to 'unassigned'
    const url = buildQueueUrl(basePath, current, { priority: 'unassigned' });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('poolAnchor')).toBe('timestamp-123'); // CONSTANT
    expect(params.get('priority')).toBe('unassigned');
    expect(params.has('page')).toBe(false); // Page resets by default
    expect(params.get('lifecycle')).toBe('intake');
  });

  it('removes poolAnchor when changing lifecycle (pool-defining)', () => {
    const current = new URLSearchParams({
      lifecycle: 'intake',
      poolAnchor: 'timestamp-123',
      page: '2',
    });

    const url = buildQueueUrl(basePath, current, { lifecycle: 'verification' });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.has('poolAnchor')).toBe(false); // DELETED
    expect(params.get('lifecycle')).toBe('verification');
    expect(params.has('page')).toBe(false);
  });

  it('removes poolAnchor when changing assignee (pool-defining)', () => {
    const current = new URLSearchParams({
      assignee: 'unassigned',
      poolAnchor: 'timestamp-123',
    });

    const url = buildQueueUrl(basePath, current, { assignee: 'me' });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.has('poolAnchor')).toBe(false); // DELETED
    expect(params.get('assignee')).toBe('me');
  });

  it('removes poolAnchor when changing search (pool-defining)', () => {
    const current = new URLSearchParams({
      poolAnchor: 'timestamp-123',
    });

    const url = buildQueueUrl(basePath, current, { search: 'CLM-123' });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.has('poolAnchor')).toBe(false); // DELETED
    expect(params.get('search')).toBe('CLM-123');
  });

  it('preserves poolAnchor and updates page when Load More is used', () => {
    const current = new URLSearchParams({
      lifecycle: 'intake',
      poolAnchor: 'timestamp-123',
      page: '1',
    });

    // Explicit page update
    const url = buildQueueUrl(basePath, current, { page: '2' });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('poolAnchor')).toBe('timestamp-123'); // PRESERVED
    expect(params.get('page')).toBe('2'); // UPDATED
  });

  it('removes pool-defining param clears anchor', () => {
    const current = new URLSearchParams({
      search: 'foo',
      poolAnchor: 'timestamp-123',
    });

    // Clear search
    const url = buildQueueUrl(basePath, current, { search: null });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.has('poolAnchor')).toBe(false); // DELETED
    expect(params.has('search')).toBe(false);
  });
});
