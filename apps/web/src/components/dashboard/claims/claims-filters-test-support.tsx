import { act, fireEvent, screen } from '@testing-library/react';
import type { InputHTMLAttributes } from 'react';
import { vi } from 'vitest';

// Mirrors SEARCH_COMMIT_DELAY_MS in use-member-claims-search.ts; kept literal
// so this module never imports the hook through mocked modules.
export const SEARCH_DEBOUNCE_MS = 250;

// Mutable mocked url: tests mutate `query` and rerender the way a real
// navigation (own commit echo, external link or back/forward) would.
export const memberClaimsNav = {
  pathname: '/member/claims',
  push: vi.fn(),
  query: '',
};

export function setMemberClaimsUrl(query: string): void {
  memberClaimsNav.query = query;
}

export function resetMemberClaimsNav(query = ''): void {
  memberClaimsNav.push.mockReset();
  memberClaimsNav.query = query;
}

export function pushedUrls(): string[] {
  return memberClaimsNav.push.mock.calls.map(call => String(call[0]));
}

export function searchInput(): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>('member-claims-search-input');
}

export function typeSearch(value: string): void {
  fireEvent.change(searchInput(), { target: { value } });
}

export function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

export function settleSearch(): void {
  advance(SEARCH_DEBOUNCE_MS);
}

// Back/forward: the browser fires popstate before the new url is observed.
export function popBack(query: string): void {
  window.history.replaceState(null, '', `/member/claims?${query}`);
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  setMemberClaimsUrl(query);
}

export function routingModule() {
  return {
    usePathname: () => memberClaimsNav.pathname,
    useRouter: () => ({ push: memberClaimsNav.push }),
  };
}

export function navigationModule() {
  return {
    // Fresh instance per render keeps the mocked url genuinely mutable.
    useSearchParams: () => new URLSearchParams(memberClaimsNav.query),
  };
}

export function intlModule() {
  const translations: Record<string, string> = {
    all: 'All',
    processing: 'Processing...',
    search: 'Search',
    draft: 'Draft',
    submitted: 'Submitted',
  };

  return {
    useTranslations: () => (key: string) => translations[key] || key,
  };
}

export function uiModule() {
  return {
    badgeVariants: () => 'badge',
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  };
}

// Import this shared fixture before ClaimsFilters so registration precedes loading.
vi.mock('@/i18n/routing', () => routingModule());
vi.mock('next/navigation', () => navigationModule());
vi.mock('next-intl', () => intlModule());
vi.mock('@interdomestik/ui', () => uiModule());
