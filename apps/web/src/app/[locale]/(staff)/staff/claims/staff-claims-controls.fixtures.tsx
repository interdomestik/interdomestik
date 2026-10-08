import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, MouseEvent, ReactElement, ReactNode } from 'react';
import { startTransition, Suspense, use, useLayoutEffect, useState } from 'react';
import { vi } from 'vitest';

// Type-only: this module doubles as the '@/i18n/routing' mock, so it must not
// load the component at runtime.
import type { StaffClaimsControls } from './staff-claims-controls';

// Stand-in for the locale-aware App Router. Like the real router, push only
// queues a transition-scoped route update that suspends on the destination
// payload, so the caller's isPending stays true until a test releases that
// payload or a history traversal supersedes it. Nothing settles on a timer.

type ControlsProps = ComponentProps<typeof StaffClaimsControls>;
type Route = { data: PromiseLike<void>; href: string };
type Filters = Partial<Record<'assigned' | 'diaspora' | 'search' | 'status', string>>;

export const INITIAL_HREF =
  '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Acme';

const outstandingNavigations: Array<{ href: string; resolve: () => void }> = [];
let setCommittedRoute: ((route: Route) => void) | null = null;

export const routerPush = vi.fn((href: string) => {
  let resolve: () => void = () => undefined;
  const data = new Promise<void>(done => {
    resolve = done;
  });
  outstandingNavigations.push({ href, resolve });
  startTransition(() => setCommittedRoute?.({ data, href }));
});

export function useRouter() {
  return { push: routerPush };
}

export function Link({
  children,
  href,
  onClick,
  prefetch: _prefetch,
  ...props
}: Readonly<{
  children: ReactNode;
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  prefetch?: boolean;
}>) {
  return (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  );
}

function settledRoute(href: string): Route {
  // Already fulfilled, like a cached history entry: use() reads it without suspending.
  return {
    data: Object.assign(Promise.resolve(), { status: 'fulfilled', value: undefined }),
    href,
  };
}

function staffClaimsHref(filters: Filters): string {
  const params = new URLSearchParams();
  for (const name of ['assigned', 'status', 'diaspora', 'search'] as const) {
    const value = filters[name];
    if (value) {
      params.set(name, value);
    }
  }

  const query = params.toString();
  return query ? `/staff/claims?${query}` : '/staff/claims';
}

// Mirrors the server caller: every prop is derived from the committed route.
export function buildControlsProps(href: string): ControlsProps {
  const params = new URL(href, 'http://localhost').searchParams;
  const current: Filters = {
    assigned: params.get('assigned') ?? undefined,
    diaspora: params.get('diaspora') ?? undefined,
    search: params.get('search') ?? undefined,
    status: params.get('status') ?? undefined,
  };
  const option = (name: keyof Filters, value: string, label: string, testId: string) => ({
    href: staffClaimsHref({ ...current, [name]: value === 'all' ? undefined : value }),
    isActive: (current[name] ?? 'all') === value,
    label,
    testId,
    value,
  });

  return {
    assignmentFilterLabel: 'Assignment filter',
    assignmentOptions: [
      option('assigned', 'all', 'All branch claims', 'staff-claims-assigned-filter-all'),
      option('assigned', 'unassigned', 'Unassigned', 'staff-claims-assigned-filter-unassigned'),
    ],
    clearSearchHref: current.search
      ? staffClaimsHref({ ...current, search: undefined })
      : undefined,
    clearSearchLabel: 'Clear',
    currentSearch: current.search,
    diasporaFilterLabel: 'Origin filter',
    diasporaOptions: [
      option('diaspora', 'all', 'All origins', 'staff-claims-diaspora-filter-all'),
      option(
        'diaspora',
        'diaspora',
        'Diaspora / Green Card',
        'staff-claims-diaspora-filter-diaspora'
      ),
    ],
    formAction: '/en/staff/claims',
    hiddenFields: (['assigned', 'status', 'diaspora'] as const).flatMap(name => {
      const value = current[name];
      return value ? [{ name, value }] : [];
    }),
    pendingFilterLabel: 'Updating filters...',
    pendingSearchLabel: 'Searching claims...',
    searchLabel: 'Search',
    searchPlaceholder: 'Search claim, member, company, or number',
    statusFilterLabel: 'Status filter',
    statusOptions: [
      option('status', 'all', 'All actionable', 'staff-claims-status-filter-all'),
      option('status', 'verification', 'Verification', 'staff-claims-status-filter-verification'),
    ],
  };
}

type RenderControls = (props: ControlsProps) => ReactElement;

function RoutedStaffClaims({
  initialHref,
  renderControls,
}: Readonly<{
  initialHref: string;
  renderControls: RenderControls;
}>) {
  const [route, setRoute] = useState<Route>(() => settledRoute(initialHref));

  useLayoutEffect(() => {
    setCommittedRoute = setRoute;
    return () => {
      setCommittedRoute = null;
    };
  }, []);

  use(route.data);

  // No key: the controls instance is retained across routes, as in Next.
  return (
    <>
      <p data-testid="routed-result">{route.href}</p>
      {renderControls(buildControlsProps(route.href))}
    </>
  );
}

export function renderRoutedControls(renderControls: RenderControls, initialHref = INITIAL_HREF) {
  return render(
    <Suspense fallback={<p data-testid="routed-fallback" />}>
      <RoutedStaffClaims initialHref={initialHref} renderControls={renderControls} />
    </Suspense>
  );
}

export function resetNavigationHarness() {
  routerPush.mockClear();
  outstandingNavigations.length = 0;
}

/** One awaited act turn: every activation inside shares a single event turn. */
export async function interact(run: () => void) {
  await act(async () => {
    run();
    await Promise.resolve();
  });
}

export async function completeNavigation(href: string) {
  const index = outstandingNavigations.findIndex(navigation => navigation.href === href);
  const navigation = outstandingNavigations[index];
  if (!navigation) {
    throw new Error(`No outstanding navigation to ${href}`);
  }

  outstandingNavigations.splice(index, 1);
  await act(async () => {
    navigation.resolve();
    await Promise.resolve();
  });
}

/** Back/forward to a cached entry; supersedes any outstanding push. */
export async function traverseHistory(href: string) {
  await act(async () => {
    startTransition(() => setCommittedRoute?.(settledRoute(href)));
    await Promise.resolve();
  });
}

export function typeSearch(value: string) {
  fireEvent.change(screen.getByTestId('staff-claims-search-input'), { target: { value } });
}

/** Returns whether native form submission was left to the browser. */
export async function submitSearch() {
  let nativeSubmissionAllowed = true;
  await interact(() => {
    nativeSubmissionAllowed = fireEvent.submit(screen.getByTestId('staff-claims-search-form'));
  });
  return nativeSubmissionAllowed;
}

/** Returns whether the native anchor activation was left to the browser. */
export async function clickLink(link: HTMLElement, init: MouseEventInit = {}) {
  let nativeNavigationAllowed = false;
  // Window listeners run after React's root listener. Preventing here also
  // stops jsdom from attempting a real document navigation.
  const observe = (event: Event) => {
    nativeNavigationAllowed = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', observe);
  try {
    await interact(() => fireEvent.click(link, init));
  } finally {
    window.removeEventListener('click', observe);
  }
  return nativeNavigationAllowed;
}

export function isBusy() {
  return screen.getByTestId('staff-claims-filters').getAttribute('aria-busy') === 'true';
}

export function hiddenFieldValues() {
  const form = screen.getByTestId('staff-claims-search-form');
  const fields = form.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
  return Object.fromEntries(Array.from(fields, field => [field.name, field.value]));
}
