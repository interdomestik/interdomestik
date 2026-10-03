import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity, StrictMode, type MouseEvent, type ReactNode } from 'react';
import { vi } from 'vitest';

import type { CashVerificationRequestDTO } from '../../server/types';
import { VerificationOpsCenterClient } from './VerificationOpsCenterClient';
import { createRequest } from './verification-search.fixture';

// Actual search, ops controls and selection run; heavy leaves alone are stubbed.
const navigation = vi.hoisted(() => ({
  pathname: '/admin/leads',
  search: '',
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({
    replace: navigation.replace,
    push: navigation.push,
    refresh: navigation.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../actions/verification', () => ({
  verifyCashAttemptAction: vi.fn(async () => ({ success: true })),
}));

vi.mock('./VerificationKpis', () => ({
  VerificationKpis: ({ pending }: { pending: number }) => (
    <div data-testid="verification-kpis">{pending}</div>
  ),
}));

vi.mock('./VerificationTableV2', () => ({
  VerificationTableV2: ({
    data,
    onViewDetails,
  }: {
    data: { id: string }[];
    historyMode: boolean;
    onViewDetails: (id: string) => void;
    onVerify: (id: string) => void;
    onAction: (id: string, decision: 'reject' | 'needs_info') => void;
  }) => (
    <div data-testid="verification-table">
      {data.map(row => (
        <button
          key={row.id}
          type="button"
          data-testid={`row-select-${row.id}`}
          onClick={() => onViewDetails(row.id)}
        >
          {row.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../VerificationDetailsDrawer', () => ({
  VerificationDetailsDrawer: ({
    isOpen,
    onClose,
  }: {
    attemptId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onActionComplete: () => void;
  }) =>
    isOpen ? (
      <button type="button" data-testid="drawer-close" onClick={onClose}>
        close
      </button>
    ) : null,
}));

vi.mock('../VerificationActionDialog', () => ({
  VerificationActionDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pendingDecision: 'reject' | 'needs_info' | null;
    note: string;
    onNoteChange: (note: string) => void;
    onSubmit: () => void;
  }) => (open ? <div data-testid="verification-action-dialog" /> : null),
}));

export const FIXTURE_HREFS = {
  sibling: '/admin/users',
  external: 'https://example.com/elsewhere',
  manual: '/admin/manual-navigation',
} as const;

const SIBLING_HREF = FIXTURE_HREFS.sibling;
const EXTERNAL_HREF = FIXTURE_HREFS.external;
const MANUAL_HREF = FIXTURE_HREFS.manual;

function NavigationFixtures() {
  // jsdom cannot navigate, so fixtures preventDefault in the bubble phase: the
  // shipped capture listener has already decided by then.
  const stop = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault();

  return (
    <nav>
      <a href={SIBLING_HREF} data-testid="sibling-link" onClick={stop}>
        members
      </a>
      <a
        href={EXTERNAL_HREF}
        target="_blank"
        rel="noreferrer"
        data-testid="external-link"
        onClick={stop}
      >
        external
      </a>
      <a href={MANUAL_HREF} data-manual-navigation="true" data-testid="manual-link" onClick={stop}>
        manual
      </a>
    </nav>
  );
}

export function setUrl(search: string, pathname = '/admin/leads'): void {
  navigation.pathname = pathname;
  navigation.search = search;
  window.history.replaceState(null, '', search ? `${pathname}?${search}` : pathname);
}

export function resetHarness(): void {
  vi.useFakeTimers();
  navigation.replace.mockClear();
  navigation.push.mockClear();
  navigation.refresh.mockClear();
  setUrl('');
}

export function teardownHarness(): void {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
}

export type ReplaceCall = [url: string, options?: { scroll?: boolean }];

export function replaceCalls(): ReplaceCall[] {
  return navigation.replace.mock.calls as unknown as ReplaceCall[];
}

export function lastReplace(): ReplaceCall {
  const call = replaceCalls().at(-1);
  if (!call) {
    throw new Error('expected a navigation');
  }
  return call;
}

export function queryOf(url: string): URLSearchParams {
  const index = url.indexOf('?');
  return new URLSearchParams(index === -1 ? '' : url.slice(index + 1));
}

export function searchInput(): HTMLInputElement {
  return screen.getByTestId('verification-search-input') as HTMLInputElement;
}

export function typeSearch(value: string): void {
  const input = searchInput();
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
}

export function clickTestId(testId: string, init?: MouseEventInit): void {
  const target = screen.getByTestId(testId);
  act(() => {
    fireEvent.click(target, init);
  });
}

export function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

export function isBusy(): boolean {
  return screen.getByTestId('verification-filters').getAttribute('aria-busy') === 'true';
}

export function hasPendingLabel(): boolean {
  return screen.queryByTestId('verification-search-pending') !== null;
}

type HarnessOptions = {
  initialData?: CashVerificationRequestDTO[];
  initialParams?: { view: 'queue' | 'history'; query: string };
  search?: string;
  strictMode?: boolean;
};

export type Harness = {
  rerender: () => void;
  /** External url change: back/forward, redirect or an unrelated navigation. */
  navigateTo: (search: string) => void;
  /** Publishes the url of the most recent router.replace, like Next would. */
  commitLastNavigation: () => void;
  unmount: () => void;
  setActivityMode: (mode: 'visible' | 'hidden') => void;
};

export function renderClient(options: HarnessOptions = {}): Harness {
  if (options.search !== undefined) {
    setUrl(options.search);
  }

  const committed = new URLSearchParams(navigation.search);
  const initialData = options.initialData ?? [createRequest()];
  const initialParams = options.initialParams ?? {
    view: committed.get('view') === 'history' ? ('history' as const) : ('queue' as const),
    query: committed.get('query') ?? '',
  };

  let activityMode: 'visible' | 'hidden' = 'visible';
  const tree = (): ReactNode => {
    const content = (
      <>
        <VerificationOpsCenterClient initialData={initialData} initialParams={initialParams} />
        <NavigationFixtures />
      </>
    );

    const retained = <Activity mode={activityMode}>{content}</Activity>;
    return options.strictMode ? <StrictMode>{retained}</StrictMode> : retained;
  };

  const view = render(tree());

  const rerender = () => {
    act(() => {
      view.rerender(tree());
    });
  };

  return {
    rerender,
    setActivityMode: mode => {
      activityMode = mode;
      rerender();
    },
    navigateTo: (search: string) => {
      setUrl(search);
      rerender();
    },
    commitLastNavigation: () => {
      const [url] = lastReplace();
      setUrl(queryOf(url).toString());
      rerender();
    },
    unmount: () => {
      view.unmount();
    },
  };
}
