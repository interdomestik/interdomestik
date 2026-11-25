import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';
import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import {
  deferFetch,
  mockFetch,
  navigation,
  setupApiTable,
} from './member-claims-table-test-support';
import { SEARCH_COMMIT_DELAY_MS } from '@/hooks/use-responsive-search';

vi.unmock('next-intl');
const loadMocks = vi.hoisted(() => () => import('./member-claims-table-test-support'));
vi.mock('next/navigation', async () => (await loadMocks()).nextNavigationMock());
vi.mock('@/i18n/routing', async () => (await loadMocks()).routingMock());
vi.mock('./claim-status-badge', async () => (await loadMocks()).claimStatusBadgeMock());

const renderTable = await setupApiTable();
describe('MemberClaimsTable (wire-to-mounted regression)', () => {
  it('keeps settled rows and the live line until the requested page returns', async () => {
    mockFetch({ ...wireResponse([wireRow()]), totalPages: 2 });
    const { commit } = renderTable();
    const firstRow = await screen.findByRole('link', { name: 'Flight Delay' });
    const live = screen.getByText('Page 1 of 2: 1 case');
    const next = screen.getByTestId('member-claims-page-next');
    next.focus();
    fireEvent.click(next);

    expect(screen.getByTestId('member-claims-page-previous').tagName).toBe('SPAN');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('href', '/member/claims?page=2');
    const pending = screen.getByTestId('member-claims-pagination-pending');
    expect(screen.getByRole('status')).toBe(pending);
    expect(pending).toBeInstanceOf(HTMLOutputElement);
    expect(pending).not.toHaveAttribute('aria-live');

    const finish = deferFetch();
    commit('page=2');
    expect(screen.getByText('Showing the previous results while updating…')).toBeVisible();
    expect(firstRow).toBeVisible();
    const region = screen.getByRole('region', { name: claims.claims.title });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('member-claims-table-region')).toBeNull();
    // The indicator describes the retained page-1 rows, not the requested page.
    expect(within(region).getByText('Page 1 of 2')).toBeVisible();
    expect(within(region).queryByText('Page 2 of 2')).toBeNull();
    expect(region).not.toContainElement(live);
    expect(screen.getByTestId('member-claims-page-next')).toBe(next);
    expect(fireEvent.click(next)).toBe(false);
    await userEvent.keyboard('{Enter}');
    expect(next).toHaveFocus();
    expect(navigation.push).toHaveBeenCalledOnce();

    finish(
      new Response(
        JSON.stringify({
          ...wireResponse([wireRow({ id: 'page-two', title: 'Case on page two' })]),
          page: 2,
          totalPages: 2,
        })
      )
    );
    expect(await screen.findByRole('link', { name: 'Case on page two' })).toBeVisible();
    expect(screen.getByTestId('member-claims-table-region')).toBe(region);
    expect(screen.getByText('Page 2 of 2: 1 case')).toBe(live);
    expect(screen.getByTestId('member-claims-page-next').tagName).toBe('SPAN');
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(region).toHaveFocus();
    expect(screen.queryByTestId('member-claims-pagination-pending')).not.toBeInTheDocument();
  });

  it('keeps a filter navigation pending before URL commit and only shows current-key empty', async () => {
    mockFetch({ ...wireResponse([wireRow()]), totalPages: 2 });
    const { commit } = renderTable('en', true);
    await screen.findByRole('link', { name: 'Flight Delay' });
    const draft = screen.getByTestId('member-claims-status-filter-draft');
    draft.focus();
    fireEvent.click(draft);
    const region = screen.getByTestId('member-claims-table-region');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('member-claims-page-next')).toHaveAttribute('aria-disabled', 'true');

    const finish = deferFetch();
    commit('status=draft');
    expect(screen.getByText('Showing the previous results while updating…')).toBeVisible();
    expect(screen.queryByTestId('member-claims-empty')).not.toBeInTheDocument();
    finish(new Response(JSON.stringify({ ...wireResponse([]), totalPages: 0 })));

    const empty = await screen.findByTestId('member-claims-empty');
    expect(empty).toHaveTextContent(claims.claims.empty.filtered);
    expect(within(empty).queryByRole('link')).not.toBeInTheDocument();
    expect(draft).toHaveFocus();
  });

  it('retains the first successful rows when an already-pending search commits', async () => {
    const firstPage = wireResponse([wireRow()]);
    mockFetch(firstPage);
    const finishFirstPage = deferFetch();
    const { commit } = renderTable('en', true);
    const region = screen.getByRole('region', { name: claims.claims.title });
    expect(within(region).getByText(common.common.loading)).toBeVisible();
    const finishSearch = deferFetch();

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByRole('textbox', { name: common.common.search }), {
        target: { value: 'flight' },
      });
      act(() => vi.advanceTimersByTime(SEARCH_COMMIT_DELAY_MS));
      expect(navigation.push).toHaveBeenCalledWith('/member/claims?search=flight', {
        scroll: false,
      });
      expect(screen.getByTestId('member-claims-pending')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }

    finishFirstPage(new Response(JSON.stringify(firstPage)));
    const firstRow = await screen.findByRole('link', { name: 'Flight Delay' });
    const live = region.parentElement?.querySelector('[aria-live="polite"]');
    expect(live).toBeEmptyDOMElement();

    commit('search=flight');
    expect(firstRow).toBeVisible();
    expect(within(region).getByText(claims.claims.memberList.updating)).toBeVisible();
    expect(within(region).queryByText(common.common.loading)).not.toBeInTheDocument();
    expect(region.querySelector('.motion-safe\\:animate-pulse')).not.toBeInTheDocument();
    expect(live).toBeEmptyDOMElement();

    finishSearch(new Response(JSON.stringify(wireResponse([wireRow({ title: 'Search result' })]))));
    expect(await screen.findByRole('link', { name: 'Search result' })).toBeVisible();
    expect(live).toHaveTextContent('Page 1 of 1: 1 case');
  });

  it('keeps the rows when a background refresh lands just before a page commit', async () => {
    mockFetch({ ...wireResponse([wireRow()]), totalPages: 2 });
    const { commit, queryClient } = renderTable();
    const firstRow = await screen.findByRole('link', { name: 'Flight Delay' });
    const pageOneKey = ['claims', 'member', { page: 1 }];
    const settled = queryClient.getQueryData<{ claims: Array<Record<string, unknown>> }>(
      pageOneKey
    );
    expect(settled?.claims).toHaveLength(1);
    const finishPageTwo = deferFetch();

    // A background refresh (changed status) reaches the cache in the same render as the URL
    // commit, so the placeholder is a new page-1 object the table has not rendered yet.
    act(() => {
      queryClient.setQueryData(pageOneKey, {
        ...settled,
        claims: settled!.claims.map(claim => ({ ...claim, status: 'evaluation' })),
      });
      commit('page=2');
    });

    const region = screen.getByRole('region', { name: claims.claims.title });
    expect(firstRow).toBeVisible();
    expect(within(region).getByText(claims.claims.memberList.updating)).toBeVisible();
    expect(within(region).queryByText(common.common.loading)).not.toBeInTheDocument();
    expect(region.querySelector('.motion-safe\\:animate-pulse')).not.toBeInTheDocument();

    finishPageTwo(
      new Response(
        JSON.stringify({
          ...wireResponse([wireRow({ id: 'page-two', title: 'Case on page two' })]),
          page: 2,
          totalPages: 2,
        })
      )
    );
    expect(await screen.findByRole('link', { name: 'Case on page two' })).toBeVisible();
  });

  it('releases pagination immediately on Back after a page commits with placeholder rows', async () => {
    const firstPage = { ...wireResponse([wireRow()]), totalPages: 2 };
    mockFetch(firstPage);
    const { commit } = renderTable();
    await screen.findByRole('link', { name: 'Flight Delay' });

    const finishPageTwo = deferFetch();
    fireEvent.click(screen.getByTestId('member-claims-page-next'));
    commit('page=2');
    expect(screen.getByText(claims.claims.memberList.updating)).toBeVisible();
    expect(screen.getByTestId('member-claims-pagination-pending')).toBeVisible();

    commit('');
    expect(screen.getByRole('link', { name: 'Flight Delay' })).toBeVisible();
    expect(screen.queryByTestId('member-claims-pagination-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: claims.claims.title })).not.toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('link', { name: common.common.next })).not.toHaveAttribute(
      'aria-disabled'
    );
    finishPageTwo(new Response(JSON.stringify({ ...firstPage, page: 2 })));
  });
});
