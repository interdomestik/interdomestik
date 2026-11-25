import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import claimsSq from '@/messages/sq/claims.json';
import commonSq from '@/messages/sq/common.json';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

export const catalogues = {
  en: { ...claims, ...common },
  sq: { ...claimsSq, ...commonSq },
};

export const navigation = {
  query: '',
  push: vi.fn(),
  searchParams: new URLSearchParams(),
};

export function nextNavigationMock() {
  return { useSearchParams: () => new URLSearchParams(navigation.query) };
}

export function unitNextNavigationMock() {
  return { useSearchParams: () => navigation.searchParams };
}

export function routingMock() {
  return {
    Link: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
      <a {...props} />
    ),
    usePathname: () => '/member/claims',
    useRouter: () => ({ push: navigation.push }),
  };
}

export function claimStatusBadgeMock() {
  return { ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span> };
}

export async function reactQueryMock(
  importOriginal: () => Promise<typeof import('@tanstack/react-query')>
) {
  return { ...(await importOriginal()), useQuery: vi.fn() };
}

export function claimsApiMock() {
  return { fetchClaims: vi.fn() };
}

export function intlMock() {
  return {
    useLocale: () => 'en',
    useTranslations: () =>
      Object.assign(
        (key: string) => {
          const translations: Record<string, string> = {
            'detail.continuity.caseLabel': 'Case',
            'table.company': 'Company',
            'table.category': 'Category',
            'table.status': 'Status',
            'table.amount': 'Amount',
            'table.created': 'Created',
            'table.unavailable': 'Unavailable',
            'empty.title': 'No claims yet',
            'empty.description': 'Start by creating your first claim',
            'empty.filtered': 'No claims match your filters',
            'empty.createFirst': 'Create First Claim',
            showing: 'Showing',
            claim: 'claim',
            claimsPlural: 'claims',
            loading: 'Loading...',
            processing: 'Processing...',
            'errors.generic': 'An error occurred',
            tryAgain: 'Try Again',
            previous: 'Previous',
            next: 'Next',
            'pagination.pageOf': 'Page {page} of {total}',
            auto: 'Auto',
            travel: 'Travel',
          };
          return translations[key] || key;
        },
        { has: (key: string) => key === 'auto' || key === 'travel' }
      ),
  };
}

export function resetUnitNavigation() {
  vi.clearAllMocks();
  navigation.searchParams = new URLSearchParams();
}

export async function setupApiTable() {
  // A mock factory can import this module while evaluating either component.
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { NextIntlClientProvider } = await import('next-intl');
  const { ClaimsFilters } = await import('./claims-filters');
  const { MemberClaimsTable } = await import('./member-claims-table');

  beforeEach(() => {
    vi.clearAllMocks();
    navigation.query = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return function renderTable(locale: keyof typeof catalogues = 'en', withFilters = false) {
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
  };
}

export function rowFor(text: string) {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error('Expected claim table row');
  return row;
}

export function mockFetch(body: unknown, init: { ok?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: init.ok ?? true, json: () => Promise.resolve(body) })
  );
}

export function deferFetch() {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise<Response>(resolve => {
      finish = resolve;
    })
  );
  return finish;
}

export const mockClaims = [
  {
    id: 'claim-1',
    title: 'Car Accident',
    companyName: 'State Farm',
    category: 'auto',
    status: 'submitted',
    claimAmount: '5000',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'claim-2',
    title: 'Flight Delay',
    companyName: 'Lufthansa',
    category: 'travel',
    status: 'verification',
    claimAmount: '600',
    currency: 'EUR',
    createdAt: '2024-01-14T10:00:00Z',
  },
];
