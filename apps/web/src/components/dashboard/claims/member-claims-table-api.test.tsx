import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsFilters } from './claims-filters';
import { MemberClaimsTable } from './member-claims-table';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';
import { NextIntlClientProvider } from 'next-intl';
import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import claimsSq from '@/messages/sq/claims.json';
import commonSq from '@/messages/sq/common.json';
import { PENDING_FEEDBACK_TIMEOUT_MS, SEARCH_COMMIT_DELAY_MS } from '@/hooks/use-responsive-search';

const catalogues = {
  en: { ...claims, ...common },
  sq: { ...claimsSq, ...commonSq },
};

const navigation = vi.hoisted(() => ({ query: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
  usePathname: () => '/member/claims',
  useRouter: () => ({ push: navigation.push }),
}));

vi.unmock('next-intl');

vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

function renderTable(locale: keyof typeof catalogues = 'en', withFilters = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale={locale} messages={catalogues[locale]}>
        {withFilters ? <ClaimsFilters /> : null}
        <MemberClaimsTable />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    queryClient,
    commit(query: string) {
      navigation.query = query;
      view.rerender(tree());
    },
  };
}

function rowFor(text: string) {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error('Expected claim table row');
  return row;
}

function mockFetch(body: unknown, init: { ok?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: init.ok ?? true, json: async () => body })
  );
}

function deferFetch() {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise<Response>(resolve => {
      finish = resolve;
    })
  );
  return finish;
}

describe('MemberClaimsTable (wire-to-mounted regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.query = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { title: 'Stored EUR', amount: '1200.00', currency: 'EUR', number: 1200 },
    { title: 'Zero EUR', amount: '0.00', currency: 'EUR', number: 0 },
    { title: 'Stored MKD', amount: '2500.50', currency: 'MKD', number: 2500.5 },
    { title: 'Absent amount', amount: null, currency: 'EUR', number: null },
    { title: 'Malformed amount', amount: 'not-a-number', currency: 'EUR', number: null },
    { title: 'Absent currency', amount: '1200.00', currency: null, number: null },
    { title: 'Malformed currency', amount: '1200.00', currency: 'INVALID', number: null },
  ])(
    'renders actual V2 $title without inventing amount or currency',
    async ({ title, amount, currency, number }) => {
      const expected =
        number === null
          ? '-'
          : new Intl.NumberFormat('en', { style: 'currency', currency: currency ?? 'EUR' }).format(
              number
            );
      mockFetch(wireResponse([wireRow({ title, amount, currency })]));
      renderTable();
      await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
      const row = rowFor(title);
      expect(within(row).getByText(expected, { normalizer: text => text })).toBeInTheDocument();
      expect(row).not.toHaveTextContent('NaN');
      if (currency === 'MKD') expect(row).not.toHaveTextContent('€');
      expect(screen.getByTestId('member-claims-table-region')).toHaveAttribute(
        'aria-busy',
        'false'
      );
    }
  );

  it('uses the continental amount format for the mounted Albanian locale', async () => {
    mockFetch(wireResponse([wireRow()]));
    renderTable('sq');
    await waitFor(() => expect(screen.getByText('Flight Delay')).toBeInTheDocument());
    const text = '1.200,00\u00a0€';
    expect(text).not.toBe(
      new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(1200)
    );
    expect(
      within(rowFor('Flight Delay')).getByText(text, { normalizer: value => value })
    ).toBeInTheDocument();
  });

  it('shows the error state and allows retry when the request fails', async () => {
    mockFetch({}, { ok: false });

    renderTable();

    await waitFor(() => expect(screen.getByText(common.common.errors.generic)).toBeInTheDocument());
    expect(screen.getByText(common.common.tryAgain)).toBeInTheDocument();
    let finishRetry!: (response: Response) => void;
    const retry = new Promise<Response>(resolve => {
      finishRetry = resolve;
    });
    vi.mocked(fetch).mockReturnValueOnce(retry);
    const button = screen.getByRole('button', { name: common.common.tryAgain });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: common.common.processing })).toBe(button);
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveFocus();
      expect(screen.getByRole('alert')).toBeVisible();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(2);
    finishRetry(new Response(JSON.stringify(wireResponse([wireRow()]))));
    await waitFor(() => expect(screen.getByText('Flight Delay')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 1: 1 case')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('region', { name: claims.claims.title })).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps retry focused after a failed refetch and re-enables the same button', async () => {
    mockFetch({}, { ok: false });
    renderTable();

    const retry = await screen.findByRole('button', { name: common.common.tryAgain });
    retry.focus();
    const finish = deferFetch();
    fireEvent.click(retry);
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    finish(new Response('{}', { status: 503 }));
    await waitFor(() => expect(retry).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByRole('button', { name: common.common.tryAgain })).toBe(retry);
    expect(retry).toHaveFocus();
    expect(screen.getByRole('alert')).toBeVisible();
  });

  it('keeps retry mounted and focused when an equivalent URL commits', async () => {
    navigation.query = 'page=1';
    mockFetch({}, { ok: false });
    const { commit } = renderTable();

    const retry = await screen.findByRole('button', { name: common.common.tryAgain });
    const finish = deferFetch();
    retry.focus();
    fireEvent.click(retry);
    commit('');

    expect(screen.getByRole('button', { name: common.common.processing })).toBe(retry);
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveFocus();

    finish(new Response(JSON.stringify(wireResponse([wireRow()]))));
    expect(await screen.findByRole('link', { name: 'Flight Delay' })).toBeVisible();
    expect(screen.getByTestId('member-claims-table-region')).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

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

  it('uses the page returned by the server for both page labels', async () => {
    navigation.query = 'page=3';
    mockFetch({ ...wireResponse([wireRow()]), page: 2, totalPages: 2 });
    renderTable();

    expect(await screen.findByText('Page 2 of 2: 1 case')).toHaveAttribute('aria-live', 'polite');
    expect(
      within(screen.getByTestId('member-claims-table-region')).getByText('Page 2 of 2')
    ).toBeVisible();
  });

  it('shows catalogued text for absent companies and unrecognized categories', async () => {
    mockFetch(wireResponse([wireRow({ companyName: ' ', category: 'unknown-category' })]));
    renderTable();
    await screen.findByRole('link', { name: 'Flight Delay' });
    const row = rowFor('Flight Delay');
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent(claims.claims.table.unavailable);
    expect(cells[3]).toHaveTextContent(claims.claims.table.unavailable);
    expect(row).not.toHaveTextContent('unknown-category');
  });

  it('does not mark a settled key busy while a background refetch runs', async () => {
    mockFetch(wireResponse([wireRow()]));
    const { queryClient } = renderTable();
    await screen.findByRole('link', { name: 'Flight Delay' });
    const finish = deferFetch();
    act(() => {
      void queryClient.invalidateQueries({ queryKey: ['claims', 'member'] });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('member-claims-table-region')).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.queryByText('Showing the previous results while updating…')
    ).not.toBeInTheDocument();
    finish(new Response(JSON.stringify(wireResponse([wireRow()]))));
  });
  it('ends the retained state on request failure and uses loading for a new key without data', async () => {
    mockFetch({ ...wireResponse([wireRow()]), totalPages: 2 });
    const { commit } = renderTable();
    await screen.findByRole('link', { name: 'Flight Delay' });
    const next = screen.getByTestId('member-claims-page-next');
    const finish = deferFetch();
    next.focus();
    fireEvent.click(next);
    commit('page=2');
    expect(screen.getByText('Showing the previous results while updating…')).toBeVisible();
    finish(new Response('{}', { status: 503 }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Flight Delay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-claims-pagination-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: claims.claims.title })).toHaveFocus();

    const finishNextKey = deferFetch();
    commit('search=another');
    expect(screen.getByRole('status')).toHaveTextContent(common.common.loading);
    expect(
      screen.queryByText('Showing the previous results while updating…')
    ).not.toBeInTheDocument();
    finishNextKey(new Response(JSON.stringify(wireResponse([wireRow()]))));
    await screen.findByRole('link', { name: 'Flight Delay' });
  });
  it('settles immediately from the cache for the requested key while that key revalidates', async () => {
    mockFetch({ ...wireResponse([wireRow()]), totalPages: 2 });
    const { commit, queryClient } = renderTable();
    await screen.findByRole('link', { name: 'Flight Delay' });

    queryClient.setQueryData(['claims', 'member', { page: 2 }], {
      ...wireResponse([wireRow({ id: 'cached', title: 'Cached case' })]),
      page: 2,
      totalPages: 2,
    });
    const finish = deferFetch();
    commit('page=2');

    expect(screen.getByRole('link', { name: 'Cached case' })).toBeVisible();
    expect(screen.getByText('Page 2 of 2: 1 case')).toBeVisible();
    expect(screen.getByTestId('member-claims-table-region')).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.queryByText('Showing the previous results while updating…')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    finish(
      new Response(
        JSON.stringify({
          ...wireResponse([wireRow({ id: 'fresh', title: 'Fresh case' })]),
          page: 2,
          totalPages: 2,
        })
      )
    );
    await screen.findByRole('link', { name: 'Fresh case' });
  });
});
