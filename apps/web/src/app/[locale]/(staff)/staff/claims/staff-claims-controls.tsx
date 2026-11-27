'use client';

import { OUTLINED_LINK, PRIMARY_LINK } from '@/components/dashboard/member-portal-link-styles';
import { Link, useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import type { FormEvent, MouseEvent } from 'react';
import { useId, useLayoutEffect, useRef, useState, useTransition } from 'react';

import { StaffClaimsFilterGroup, type FilterOption } from './staff-claims-filter-group';

type HiddenField = Readonly<{
  name: string;
  value: string;
}>;

type Props = Readonly<{
  assignmentFilterLabel: string;
  assignmentOptions: readonly FilterOption[];
  clearSearchHref?: string;
  clearSearchLabel: string;
  currentSearch?: string;
  diasporaFilterLabel: string;
  diasporaOptions: readonly FilterOption[];
  formAction: string;
  hiddenFields: readonly HiddenField[];
  pendingFilterLabel: string;
  pendingSearchLabel: string;
  searchInputLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  statusFilterLabel: string;
  statusOptions: readonly FilterOption[];
}>;

type PendingKind = 'filter' | 'search';

function isPrimaryNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function StaffClaimsControls({
  assignmentFilterLabel,
  assignmentOptions,
  clearSearchHref,
  clearSearchLabel,
  currentSearch,
  diasporaFilterLabel,
  diasporaOptions,
  formAction,
  hiddenFields,
  pendingFilterLabel,
  pendingSearchLabel,
  searchInputLabel,
  searchLabel,
  searchPlaceholder,
  statusFilterLabel,
  statusOptions,
}: Props) {
  const router = useRouter();
  const id = useId();
  const searchId = `${id}-search`;
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The router runs the navigation inside this transition, so isPending stays
  // true until the destination tree commits (or a history traversal supersedes
  // it). It is the only signal that releases the controls; no timer does.
  const [isNavigationPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<PendingKind | null>(null);
  // Synchronous owner claim: a duplicate activation in the same event turn runs
  // before isPending re-renders, so it has to see the claim immediately.
  const navigationOwnerRef = useRef(false);

  useLayoutEffect(() => {
    // Released in the commit that settles the transition, before the browser
    // can deliver the next activation.
    if (!isNavigationPending) {
      navigationOwnerRef.current = false;
    }
  });

  const activePendingKind = isNavigationPending ? pendingKind : null;
  const controlsBusy = activePendingKind !== null;

  function navigateTo(href: string, kind: PendingKind) {
    navigationOwnerRef.current = true;
    setPendingKind(kind);
    startTransition(() => {
      router.push(href);
    });
  }

  function buildSearchHref(search: string) {
    const params = new URLSearchParams();

    for (const field of hiddenFields) {
      params.set(field.name, field.value);
    }

    if (search) {
      params.set('search', search);
    }

    const query = params.toString();
    return query ? `/staff/claims?${query}` : '/staff/claims';
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.defaultPrevented || navigationOwnerRef.current) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const rawSearch = new FormData(event.currentTarget).get('search');
    const href = buildSearchHref(typeof rawSearch === 'string' ? rawSearch.trim() : '');
    // The committed canonical query already shows this result; pushing it again
    // would only produce busy feedback for a navigation that changes nothing.
    if (href === buildSearchHref(currentSearch ?? '')) {
      return;
    }

    navigateTo(href, 'search');
  }

  function startFilterPending(event: MouseEvent<HTMLAnchorElement>, option: FilterOption) {
    if ((navigationOwnerRef.current || option.isActive) && isPrimaryNavigationClick(event)) {
      event.preventDefault();
      return;
    }

    if (event.defaultPrevented || !isPrimaryNavigationClick(event)) {
      return;
    }

    event.preventDefault();
    navigateTo(option.href, 'filter');
  }

  function handleClearSearch(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || !isPrimaryNavigationClick(event)) return;

    event.preventDefault();
    if (navigationOwnerRef.current) return;

    searchInputRef.current?.focus();
    navigateTo(href, 'filter');
  }

  const pendingLabel = activePendingKind === 'search' ? pendingSearchLabel : pendingFilterLabel;

  return (
    <section
      aria-busy={controlsBusy ? 'true' : undefined}
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
      data-testid="staff-claims-filters"
    >
      <form
        action={formAction}
        className="space-y-2"
        data-testid="staff-claims-search-form"
        method="get"
        onSubmit={handleSearchSubmit}
      >
        {hiddenFields.map(field => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        <label className="block text-sm font-semibold" htmlFor={searchId}>
          {searchInputLabel}
        </label>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start">
          <Input
            className="h-auto min-h-11 min-w-11 scroll-my-24 border-foreground/60 bg-[hsl(var(--surface))] placeholder:text-foreground/70 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
            id={searchId}
            name="search"
            ref={searchInputRef}
            defaultValue={currentSearch}
            placeholder={searchPlaceholder}
            data-testid="staff-claims-search-input"
          />
          <div className="flex min-w-0 flex-wrap gap-2 md:max-w-[55%] md:shrink-0">
            <button
              disabled={controlsBusy}
              className={`${PRIMARY_LINK} scroll-my-24 text-start disabled:cursor-not-allowed disabled:opacity-50`}
              type="submit"
              data-testid="staff-claims-search-submit"
            >
              {searchLabel}
            </button>
            {currentSearch && clearSearchHref && (
              <Link
                href={clearSearchHref}
                aria-disabled={controlsBusy ? 'true' : undefined}
                className={`${OUTLINED_LINK} scroll-my-24`}
                onClick={event => handleClearSearch(event, clearSearchHref)}
                prefetch={false}
                tabIndex={controlsBusy ? -1 : undefined}
              >
                {clearSearchLabel}
              </Link>
            )}
          </div>
        </div>
      </form>

      {controlsBusy && (
        <p
          className="flex w-fit max-w-full items-center gap-2 rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-strong))] px-3 py-2 text-sm font-medium forced-colors:border-[CanvasText]"
          data-testid="staff-claims-pending"
          role="status"
        >
          <span
            className="size-2 shrink-0 rounded-full bg-current motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="min-w-0">{pendingLabel}</span>
        </p>
      )}

      <StaffClaimsFilterGroup
        isPending={controlsBusy}
        label={assignmentFilterLabel}
        labelId={`${id}-assignment`}
        onNavigate={startFilterPending}
        options={assignmentOptions}
        testId="staff-claims-assignment-filters"
      />
      <StaffClaimsFilterGroup
        isPending={controlsBusy}
        label={statusFilterLabel}
        labelId={`${id}-status`}
        onNavigate={startFilterPending}
        options={statusOptions}
        testId="staff-claims-status-filters"
      />
      <StaffClaimsFilterGroup
        isPending={controlsBusy}
        label={diasporaFilterLabel}
        labelId={`${id}-diaspora`}
        onNavigate={startFilterPending}
        options={diasporaOptions}
        testId="staff-claims-diaspora-filters"
      />
    </section>
  );
}
