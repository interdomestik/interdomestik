import { getLocale } from 'next-intl/server';

export type MemberPortalRegionCopy = Readonly<{
  empty: string;
  error: string;
  label: string;
  loading: string;
}>;

type BoundaryProps = Readonly<{
  action?: Readonly<{ href: string; label: string }>;
  copy: MemberPortalRegionCopy;
  locale?: string;
  state: 'empty' | 'error' | 'loading';
}>;

export function MemberPortalRegionBoundary(props: BoundaryProps) {
  if (props.action && !props.locale) {
    return getLocale().then(locale => <RegionCard {...props} locale={locale} />);
  }
  return <RegionCard {...props} />;
}

function RegionCard({ action, copy, locale, state }: BoundaryProps) {
  const isLoading = state === 'loading';

  return (
    <div
      aria-busy={isLoading || undefined}
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
      data-region-state={state}
    >
      <h2 className="text-lg font-semibold tracking-tight">{copy.label}</h2>
      <p
        className="max-w-prose text-sm leading-6 text-foreground/70"
        role={isLoading ? undefined : state === 'error' ? 'alert' : 'status'}
      >
        {copy[state]}
      </p>
      {isLoading && (
        <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
          <div className="h-3 w-2/3 rounded-full bg-[hsl(var(--surface-strong))]" />
          <div className="h-3 w-1/2 rounded-full bg-[hsl(var(--surface-strong))]" />
        </div>
      )}
      {action && (
        <a
          className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-xl border border-foreground/60 px-4 py-2 text-sm font-semibold hover:bg-[hsl(var(--surface-strong))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
          href={`/${locale}${action.href}`}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
