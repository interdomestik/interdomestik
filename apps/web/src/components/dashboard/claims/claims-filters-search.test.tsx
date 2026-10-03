import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsFilters } from './claims-filters';
import {
  advance,
  memberClaimsNav,
  popBack,
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

function pending() {
  return screen.queryByTestId('member-claims-pending');
}

function statusChip(status: string) {
  return screen.getByTestId(`member-claims-status-filter-${status}`);
}

describe('ClaimsFilters search coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMemberClaimsNav();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps input immediate and coalesces a burst into one trailing navigation', () => {
    render(<ClaimsFilters />);

    for (const value of ['C', 'Cl', 'Cla', 'Clai', 'Claim', 'Claim 2']) {
      typeSearch(value);
    }

    expect(searchInput().value).toBe('Claim 2');
    expect(pending()).toBeInTheDocument();

    advance(249);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();

    advance(1);
    expect(pushedUrls()).toEqual(['/member/claims?search=Claim+2']);
    expect(memberClaimsNav.push).toHaveBeenCalledWith('/member/claims?search=Claim+2', {
      scroll: false,
    });
  });

  it('does not let an older self-issued commit clobber newer input or pending', () => {
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('cla');
    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=cla']);

    typeSearch('claim 4');
    setMemberClaimsUrl('search=cla');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('claim 4');
    expect(pending()).toBeInTheDocument();

    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=cla', '/member/claims?search=claim+4']);
  });

  it('adopts an external url change once the search is settled', () => {
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('cla');
    settleSearch();
    setMemberClaimsUrl('search=cla');
    rerender(<ClaimsFilters />);

    expect(pending()).not.toBeInTheDocument();

    setMemberClaimsUrl('status=draft&search=back+forward');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('back forward');
    expect(statusChip('draft')).toHaveAttribute('aria-pressed', 'true');
    expect(pushedUrls()).toEqual(['/member/claims?search=cla']);
  });

  it('adopts a back navigation to a url it also committed itself', () => {
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('a');
    settleSearch();
    typeSearch('ab');
    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=a', '/member/claims?search=ab']);

    popBack('search=a');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('a');
    expect(pending()).not.toBeInTheDocument();

    advance(1_000);
    expect(pushedUrls()).toHaveLength(2);
  });

  it('cancels obsolete scheduled work for external and same-term status urls', () => {
    setMemberClaimsUrl('search=alpha');
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('alpha beta');
    setMemberClaimsUrl('search=gamma');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('gamma');
    advance(1_000);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();

    typeSearch('gamma delta');
    expect(pending()).toBeInTheDocument();

    // Same committed term, different status and page: still a real navigation.
    setMemberClaimsUrl('status=draft&search=gamma&page=2');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('gamma');
    expect(pending()).not.toBeInTheDocument();
    advance(1_000);
    expect(memberClaimsNav.push).not.toHaveBeenCalled();
  });

  it('cancels obsolete timers for same-query and type-then-clear bursts', () => {
    setMemberClaimsUrl('search=alpha');
    render(<ClaimsFilters />);

    typeSearch('alph');
    typeSearch('alpha');
    advance(1_000);

    expect(memberClaimsNav.push).not.toHaveBeenCalled();
    expect(pending()).not.toBeInTheDocument();

    typeSearch('alpha zzz');
    typeSearch('');
    settleSearch();

    expect(pushedUrls()).toEqual(['/member/claims']);
    expect(searchInput().value).toBe('');
  });

  it('drops page, preserves status and keeps a literal all term', () => {
    setMemberClaimsUrl('status=draft&search=old&page=3');
    render(<ClaimsFilters />);

    typeSearch('all');
    settleSearch();

    expect(pushedUrls()).toEqual(['/member/claims?status=draft&search=all']);
    expect(memberClaimsNav.push).toHaveBeenCalledWith('/member/claims?status=draft&search=all', {
      scroll: false,
    });
  });

  it('blocks status chips while a search edit is queued and adds no extra navigation', () => {
    render(<ClaimsFilters />);

    typeSearch('claim 2');

    expect(statusChip('draft')).toBeDisabled();
    fireEvent.click(statusChip('draft'));
    expect(memberClaimsNav.push).not.toHaveBeenCalled();

    settleSearch();

    expect(pushedUrls()).toEqual(['/member/claims?search=claim+2']);
    expect(searchInput().value).toBe('claim 2');

    advance(1_000);
    expect(pushedUrls()).toEqual(['/member/claims?search=claim+2']);
  });

  it('unblocks status chips on the settled url and keeps the committed term', () => {
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('claim 2');
    settleSearch();
    expect(statusChip('draft')).toBeDisabled();

    setMemberClaimsUrl('search=claim+2');
    rerender(<ClaimsFilters />);

    expect(pending()).not.toBeInTheDocument();
    expect(statusChip('draft')).not.toBeDisabled();

    fireEvent.click(statusChip('draft'));

    expect(pushedUrls()).toEqual([
      '/member/claims?search=claim+2',
      '/member/claims?search=claim+2&status=draft',
    ]);
  });

  it('re-commits the latest term when an echo lands out of step with input', () => {
    const { rerender } = render(<ClaimsFilters />);

    typeSearch('x');
    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=x']);

    typeSearch('');
    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=x']);

    setMemberClaimsUrl('search=x');
    rerender(<ClaimsFilters />);

    expect(searchInput().value).toBe('');

    settleSearch();
    expect(pushedUrls()).toEqual(['/member/claims?search=x', '/member/claims']);
  });

  it('recovers from a stalled commit after the existing pending timeout', () => {
    render(<ClaimsFilters />);

    typeSearch('claim');
    settleSearch();

    expect(pending()).toBeInTheDocument();
    expect(statusChip('draft')).toBeDisabled();

    advance(10_000);

    expect(pending()).not.toBeInTheDocument();
    expect(statusChip('draft')).not.toBeDisabled();
    expect(pushedUrls()).toEqual(['/member/claims?search=claim']);
  });

  it('cancels a scheduled commit on unmount and stays single-commit in StrictMode', () => {
    const { unmount } = render(<ClaimsFilters />);

    typeSearch('claim');
    unmount();
    advance(1_000);

    expect(memberClaimsNav.push).not.toHaveBeenCalled();

    render(
      <StrictMode>
        <ClaimsFilters />
      </StrictMode>
    );
    typeSearch('claim 9');
    settleSearch();

    expect(pushedUrls()).toEqual(['/member/claims?search=claim+9']);
  });

  it('keeps existing filter guards and disabled controls unchanged', () => {
    render(<ClaimsFilters />);

    fireEvent.click(statusChip('draft'));

    expect(pushedUrls()).toEqual(['/member/claims?status=draft']);
    expect(searchInput()).toBeDisabled();
    expect(statusChip('submitted')).toBeDisabled();

    fireEvent.click(statusChip('submitted'));
    advance(1_000);

    expect(pushedUrls()).toEqual(['/member/claims?status=draft']);
  });
});
