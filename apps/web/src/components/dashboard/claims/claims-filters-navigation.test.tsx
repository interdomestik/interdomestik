import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsFilters } from './claims-filters';
import {
  advance,
  memberClaimsNav,
  pushedUrls,
  resetMemberClaimsNav,
  searchInput,
  setMemberClaimsUrl,
  settleSearch,
  typeSearch,
} from './claims-filters-test-support';

vi.mock('@/i18n/routing', async () => {
  return (await import('./claims-filters-test-support')).routingModule();
});
vi.mock('next/navigation', async () => {
  return (await import('./claims-filters-test-support')).navigationModule();
});
vi.mock('next-intl', async () => {
  return (await import('./claims-filters-test-support')).intlModule();
});
vi.mock('@interdomestik/ui', async () => {
  return (await import('./claims-filters-test-support')).uiModule();
});

function browserBack(query: string): void {
  window.history.replaceState(null, '', `/member/claims?${query}`);
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
}

describe('ClaimsFilters browser navigation cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMemberClaimsNav('search=alpha');
    window.history.replaceState(null, '', '/member/claims?search=alpha');
  });
  afterEach(() => vi.useRealTimers());

  it('cancels queued work immediately before Back commits new router params', () => {
    const { rerender } = render(<ClaimsFilters />);
    typeSearch('alpha beta');
    advance(200);
    browserBack('search=previous');
    advance(100);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
    expect(searchInput().value).toBe('previous');
    setMemberClaimsUrl('search=previous');
    rerender(<ClaimsFilters />);
    advance(1_000);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
  });

  it('cancels queued work when Back returns to the same router query', () => {
    render(<ClaimsFilters />);
    typeSearch('alpha beta');
    browserBack('search=alpha');
    advance(1_000);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
    expect(searchInput().value).toBe('alpha');
    expect(screen.queryByTestId('member-claims-pending')).not.toBeInTheDocument();
  });

  it('settles a repeated own target without leaving previous pushes pending', () => {
    const { rerender } = render(<ClaimsFilters />);
    for (const term of ['a', 'b', 'a']) {
      typeSearch(term);
      settleSearch();
    }
    expect(pushedUrls()).toEqual([
      '/member/claims?search=a',
      '/member/claims?search=b',
      '/member/claims?search=a',
    ]);
    setMemberClaimsUrl('search=a');
    rerender(<ClaimsFilters />);
    expect(searchInput().value).toBe('a');
    expect(screen.queryByTestId('member-claims-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-claims-status-filter-draft')).not.toBeDisabled();
  });

  it('keeps chips blocked until the latest search settles after prolonged typing', () => {
    render(<ClaimsFilters />);
    typeSearch('term 0');
    for (let index = 1; index < 50; index += 1) {
      advance(200);
      typeSearch(`term ${index}`);
    }
    advance(200);
    const status = screen.getByTestId('member-claims-status-filter-draft');
    expect(status).toBeDisabled();
    fireEvent.click(status);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
    advance(50);
    expect(pushedUrls()).toEqual(['/member/claims?search=term+49']);
    advance(10_000);
    expect(screen.queryByTestId('member-claims-pending')).not.toBeInTheDocument();
  });

  it('blocks status navigation until Back destination params catch up', () => {
    const { rerender } = render(<ClaimsFilters />);
    typeSearch('alpha beta');
    browserBack('search=previous');
    const status = screen.getByTestId('member-claims-status-filter-draft');
    expect(status).toBeDisabled();
    fireEvent.click(status);
    advance(1_000);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
    setMemberClaimsUrl('search=previous');
    rerender(<ClaimsFilters />);
    expect(status).not.toBeDisabled();
    fireEvent.click(status);
    expect(pushedUrls()).toEqual(['/member/claims?search=previous&status=draft']);
  });
});
