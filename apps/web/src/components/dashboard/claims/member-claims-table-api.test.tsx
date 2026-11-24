import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';
import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import {
  deferFetch,
  mockFetch,
  navigation,
  rowFor,
  setupApiTable,
} from './member-claims-table-test-support';

vi.unmock('next-intl');
const loadMocks = vi.hoisted(() => () => import('./member-claims-table-test-support'));
vi.mock('next/navigation', async () => (await loadMocks()).nextNavigationMock());
vi.mock('@/i18n/routing', async () => (await loadMocks()).routingMock());
vi.mock('./claim-status-badge', async () => (await loadMocks()).claimStatusBadgeMock());

const renderTable = await setupApiTable();
describe('MemberClaimsTable (wire-to-mounted regression)', () => {
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
