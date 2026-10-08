'use client';

import { Link, useRouter } from '@/i18n/routing';
import { Button, Input } from '@interdomestik/ui';
import type { FormEvent, MouseEvent } from 'react';
import { useLayoutEffect, useRef, useState, useTransition } from 'react';

type HiddenField = {
  name: string;
  value: string;
};

type FilterOption = {
  href: string;
  isActive: boolean;
  label: string;
  testId: string;
  value: string;
};

type Props = {
  assignmentFilterLabel: string;
  assignmentOptions: FilterOption[];
  clearSearchHref?: string;
  clearSearchLabel: string;
  currentSearch?: string;
  diasporaFilterLabel: string;
  diasporaOptions: FilterOption[];
  formAction: string;
  hiddenFields: HiddenField[];
  pendingFilterLabel: string;
  pendingSearchLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  statusFilterLabel: string;
  statusOptions: FilterOption[];
};

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
  searchLabel,
  searchPlaceholder,
  statusFilterLabel,
  statusOptions,
}: Readonly<Props>) {
  const router = useRouter();
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

  function renderFilterOptions(options: FilterOption[]) {
    return options.map(option => {
      const isDisabled = Boolean(activePendingKind || option.isActive);

      return (
        <Button
          asChild
          key={option.value}
          size="sm"
          variant={option.isActive ? 'default' : 'outline'}
        >
          <Link
            href={option.href}
            aria-disabled={isDisabled ? 'true' : undefined}
            onClick={event => startFilterPending(event, option)}
            prefetch={false}
            data-testid={option.testId}
            tabIndex={isDisabled ? -1 : undefined}
          >
            {option.label}
          </Link>
        </Button>
      );
    });
  }

  const pendingLabel = activePendingKind === 'search' ? pendingSearchLabel : pendingFilterLabel;

  return (
    <section
      aria-busy={activePendingKind ? 'true' : undefined}
      className="rounded-lg border bg-white p-4 shadow-sm"
      data-testid="staff-claims-filters"
    >
      <form
        action={formAction}
        className="flex flex-col gap-3 md:flex-row md:items-center"
        data-testid="staff-claims-search-form"
        onSubmit={handleSearchSubmit}
      >
        {hiddenFields.map(field => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        <Input
          name="search"
          defaultValue={currentSearch}
          placeholder={searchPlaceholder}
          data-testid="staff-claims-search-input"
        />
        <div className="flex items-center gap-2">
          <Button
            disabled={Boolean(activePendingKind)}
            type="submit"
            data-testid="staff-claims-search-submit"
          >
            {searchLabel}
          </Button>
          {currentSearch && clearSearchHref ? (
            <Button asChild type="button" variant="ghost">
              <Link
                href={clearSearchHref}
                aria-disabled={activePendingKind ? 'true' : undefined}
                onClick={event => {
                  if (event.defaultPrevented || !isPrimaryNavigationClick(event)) {
                    return;
                  }

                  if (navigationOwnerRef.current) {
                    event.preventDefault();
                    return;
                  }

                  event.preventDefault();
                  navigateTo(clearSearchHref, 'filter');
                }}
                prefetch={false}
                tabIndex={activePendingKind ? -1 : undefined}
              >
                {clearSearchLabel}
              </Link>
            </Button>
          ) : null}
        </div>
      </form>

      {activePendingKind ? (
        <div
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-900"
          data-testid="staff-claims-pending"
          role="status"
          aria-live="polite"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-700" aria-hidden="true" />
          {pendingLabel}
        </div>
      ) : null}

      <div className="mt-4 space-y-2" data-testid="staff-claims-assignment-filters">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {assignmentFilterLabel}
        </p>
        <div className="flex flex-wrap gap-2">{renderFilterOptions(assignmentOptions)}</div>
      </div>

      <div className="mt-3 space-y-2" data-testid="staff-claims-status-filters">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusFilterLabel}
        </p>
        <div className="flex flex-wrap gap-2">{renderFilterOptions(statusOptions)}</div>
      </div>

      <div className="mt-3 space-y-2" data-testid="staff-claims-diaspora-filters">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {diasporaFilterLabel}
        </p>
        <div className="flex flex-wrap gap-2">{renderFilterOptions(diasporaOptions)}</div>
      </div>
    </section>
  );
}
