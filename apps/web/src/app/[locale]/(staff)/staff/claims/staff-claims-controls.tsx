'use client';

import { Link, useRouter } from '@/i18n/routing';
import { Button, Input } from '@interdomestik/ui';
import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useState, useTransition } from 'react';

const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;

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
  const [, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<PendingKind | null>(null);

  useEffect(() => {
    if (!pendingKind) {
      return;
    }

    const timeout = setTimeout(() => setPendingKind(null), PENDING_FEEDBACK_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [pendingKind]);

  function navigateTo(href: string, kind: PendingKind) {
    setPendingKind(kind);
    startTransition(() => {
      router.push(href);
    });
  }

  function buildSearchHref(form: HTMLFormElement) {
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const field of hiddenFields) {
      params.set(field.name, field.value);
    }

    const search = String(formData.get('search') ?? '').trim();
    if (search) {
      params.set('search', search);
    }

    const query = params.toString();
    return query ? `/staff/claims?${query}` : '/staff/claims';
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    navigateTo(buildSearchHref(event.currentTarget), 'search');
  }

  function startFilterPending(event: MouseEvent<HTMLAnchorElement>, option: FilterOption) {
    if (option.isActive && isPrimaryNavigationClick(event)) {
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
    return options.map(option => (
      <Button
        asChild
        key={option.value}
        size="sm"
        variant={option.isActive ? 'default' : 'outline'}
      >
        <Link
          href={option.href}
          aria-disabled={pendingKind || option.isActive ? 'true' : undefined}
          onClick={event => startFilterPending(event, option)}
          prefetch={false}
          data-testid={option.testId}
        >
          {option.label}
        </Link>
      </Button>
    ));
  }

  const pendingLabel = pendingKind === 'search' ? pendingSearchLabel : pendingFilterLabel;

  return (
    <section
      aria-busy={pendingKind ? 'true' : undefined}
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
            aria-disabled={pendingKind === 'search'}
            type="submit"
            data-testid="staff-claims-search-submit"
          >
            {searchLabel}
          </Button>
          {currentSearch && clearSearchHref ? (
            <Button asChild type="button" variant="ghost">
              <Link
                href={clearSearchHref}
                onClick={event => {
                  if (event.defaultPrevented || !isPrimaryNavigationClick(event)) {
                    return;
                  }

                  event.preventDefault();
                  navigateTo(clearSearchHref, 'filter');
                }}
                prefetch={false}
              >
                {clearSearchLabel}
              </Link>
            </Button>
          ) : null}
        </div>
      </form>

      {pendingKind ? (
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
