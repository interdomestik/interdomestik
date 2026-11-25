import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';
import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import {
  catalogues,
  deferFetch,
  mockFetch,
  navigation,
  setupApiTable,
} from './member-claims-table-test-support';
import { PENDING_FEEDBACK_TIMEOUT_MS } from '@/hooks/use-responsive-search';

vi.unmock('next-intl');
const loadMocks = vi.hoisted(() => () => import('./member-claims-table-test-support'));
vi.mock('next/navigation', async () => (await loadMocks()).nextNavigationMock());
vi.mock('@/i18n/routing', async () => (await loadMocks()).routingMock());
vi.mock('./claim-status-badge', async () => (await loadMocks()).claimStatusBadgeMock());

const renderTable = await setupApiTable();
describe('MemberClaimsTable (wire-to-mounted regression)', () => {
  it('links an empty later page to page one, preserving the filters', async () => {
    navigation.query = 'page=3&search=late';
    mockFetch({ ...wireResponse([]), page: 3 });
    renderTable();
    const empty = await screen.findByTestId('member-claims-empty');
    expect(empty).toHaveTextContent(claims.claims.memberList.pageEmpty);
    expect(empty).not.toHaveTextContent(claims.claims.empty.filtered);
    expect(within(empty).getByRole('link', { name: common.common.previous })).toHaveAttribute(
      'href',
      '/member/claims?search=late'
    );
  });

  it.each(['en', 'sq'] as const)(
    'reports an empty later page in %s and links back to page one',
    async locale => {
      navigation.query = 'page=3';
      mockFetch({ ...wireResponse([]), page: 3, totalPages: 1 });
      renderTable(locale);

      const messages = catalogues[locale];
      const empty = await screen.findByTestId('member-claims-empty');
      const pageEmpty = messages.claims.memberList.pageEmpty;
      expect(empty).toHaveTextContent(pageEmpty);
      expect(within(empty).getByRole('heading', { level: 3, name: pageEmpty })).toBeVisible();
      expect(empty).not.toHaveTextContent(messages.claims.empty.title);
      expect(empty).not.toHaveTextContent(messages.claims.empty.description);
      expect(within(empty).queryByRole('status')).not.toBeInTheDocument();
      expect(within(empty).getByRole('link', { name: messages.common.previous })).toHaveAttribute(
        'href',
        '/member/claims'
      );
      const region = screen.getByRole('region', { name: messages.claims.title });
      expect(region.parentElement?.querySelector('[aria-live="polite"]')?.textContent).toBe(
        pageEmpty
      );
    }
  );

  it.each(['en', 'sq'] as const)(
    'shows the normal empty state in %s when the server returns page one',
    async locale => {
      navigation.query = 'page=3';
      mockFetch({ ...wireResponse([]), page: 1, totalPages: 1 });
      renderTable(locale);

      const messages = catalogues[locale];
      const empty = await screen.findByTestId('member-claims-empty');
      expect(
        within(empty).getByRole('heading', { level: 3, name: messages.claims.empty.title })
      ).toBeVisible();
      expect(empty).toHaveTextContent(messages.claims.empty.description);
      expect(
        within(empty).getByRole('link', { name: messages.claims.empty.createFirst })
      ).toHaveAttribute('href', '/member/claims/new');
      expect(
        within(empty).queryByRole('link', { name: messages.common.previous })
      ).not.toBeInTheDocument();
    }
  );

  it('keeps the focused page-one link mounted and inert until the request settles', async () => {
    navigation.query = 'page=3';
    mockFetch({ ...wireResponse([]), page: 3, totalPages: 1 });
    const { commit } = renderTable();
    const previous = await screen.findByRole('link', { name: common.common.previous });
    const region = screen.getByRole('region', { name: claims.claims.title });
    const live = screen.getByText(claims.claims.memberList.pageEmpty, {
      selector: '[aria-live="polite"]',
    });
    const finish = deferFetch();
    previous.focus();
    fireEvent.click(previous);
    expect(navigation.push).toHaveBeenCalledWith('/member/claims', { scroll: false });

    commit('');
    expect(screen.getByRole('link', { name: common.common.previous })).toBe(previous);
    expect(previous).toHaveFocus();
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('member-claims-empty')).not.toBeInTheDocument();
    expect(within(region).queryByText(claims.claims.memberList.pageEmpty)).not.toBeInTheDocument();
    expect(within(region).getByText(claims.claims.memberList.updating)).toBeVisible();
    expect(live).toHaveTextContent(claims.claims.memberList.pageEmpty);
    expect(live).toHaveClass('sr-only');
    expect(fireEvent.click(previous, { ctrlKey: true })).toBe(false);
    const middleClick = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    expect(fireEvent(previous, middleClick)).toBe(false);
    expect(navigation.push).toHaveBeenCalledOnce();

    finish(new Response(JSON.stringify(wireResponse([wireRow()]))));
    expect(await screen.findByRole('link', { name: 'Flight Delay' })).toBeVisible();
    expect(region).toHaveFocus();
    expect(previous).not.toBeInTheDocument();
  });

  it('shows the updating copy once when a refresh fills the empty page before the return commits', async () => {
    navigation.query = 'page=3';
    mockFetch({ ...wireResponse([]), page: 3, totalPages: 1 });
    const { commit, queryClient } = renderTable();
    const previous = await screen.findByRole('link', { name: common.common.previous });
    const region = screen.getByRole('region', { name: claims.claims.title });
    const finish = deferFetch();
    previous.focus();
    fireEvent.click(previous);

    // A background refresh adds a row to page 3 in the same render as the commit to page 1.
    const pageThreeKey = ['claims', 'member', { page: 3 }];
    act(() => {
      queryClient.setQueryData(pageThreeKey, {
        ...queryClient.getQueryData<Record<string, unknown>>(pageThreeKey),
        claims: [{ ...wireRow({ id: 'late', title: 'Late row' }) }],
      });
      commit('');
    });

    expect(within(region).getAllByText(claims.claims.memberList.updating)).toHaveLength(1);
    expect(previous).toHaveFocus();
    expect(previous).toHaveAttribute('aria-disabled', 'true');

    finish(new Response(JSON.stringify(wireResponse([wireRow()]))));
    expect(await screen.findByRole('link', { name: 'Flight Delay' })).toBeVisible();
  });

  it('keeps focus on a control or the labelled region when an empty-page return commits late', async () => {
    navigation.query = 'page=3';
    mockFetch({ ...wireResponse([]), page: 3, totalPages: 1 });
    const { commit } = renderTable();
    const previous = await screen.findByRole('link', { name: common.common.previous });
    const region = screen.getByRole('region', { name: claims.claims.title });
    const finish = deferFetch();

    vi.useFakeTimers();
    try {
      previous.focus();
      fireEvent.click(previous);
      expect(navigation.push).toHaveBeenCalledWith('/member/claims', { scroll: false });
      act(() => vi.advanceTimersByTime(PENDING_FEEDBACK_TIMEOUT_MS + 1));
      expect(previous).not.toHaveAttribute('aria-disabled', 'true');
      expect(previous).toHaveFocus();
      commit('');
      expect(region).toHaveAttribute('aria-busy', 'true');
      expect(document.activeElement).not.toBe(document.body);
      expect([previous, region]).toContain(document.activeElement);
    } finally {
      vi.useRealTimers();
    }

    finish(new Response(JSON.stringify(wireResponse([wireRow()]))));
    expect(await screen.findByRole('link', { name: 'Flight Delay' })).toBeVisible();
  });
});
