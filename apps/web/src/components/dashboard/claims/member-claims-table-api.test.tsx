import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClaimsTable } from './member-claims-table';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';
import { NextIntlClientProvider } from 'next-intl';
import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/member/claims',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.unmock('next-intl');

vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

function renderTable(locale = 'en') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale={locale} messages={{ ...claims, ...common }}>
        <MemberClaimsTable />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
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

describe('MemberClaimsTable (wire-to-mounted regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('threads the actual non-English locale through the mounted amount cell', async () => {
    mockFetch(wireResponse([wireRow()]));
    renderTable('sq');
    await waitFor(() => expect(screen.getByText('Flight Delay')).toBeInTheDocument());
    const text = new Intl.NumberFormat('sq', { style: 'currency', currency: 'EUR' }).format(1200);
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
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(wireResponse([wireRow()]))));
    fireEvent.click(screen.getByText(common.common.tryAgain));
    await waitFor(() => expect(screen.getByText('Flight Delay')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
