import { Link } from '@/i18n/routing';

export type MemberPortalRegionCopy = Readonly<{
  empty: string;
  error: string;
  label: string;
  loading: string;
}>;

export function MemberPortalRegionBoundary({
  action,
  copy,
  state,
}: Readonly<{
  action?: Readonly<{ href: string; label: string }>;
  copy: MemberPortalRegionCopy;
  state: 'empty' | 'error' | 'loading';
}>) {
  const text = { empty: copy.empty, error: copy.error, loading: copy.loading }[state];
  const isLoading = state === 'loading';

  return (
    <div
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
      data-region-state={state}
    >
      <h2 className="text-lg font-semibold tracking-tight">{copy.label}</h2>
      <p
        aria-busy={isLoading || undefined}
        aria-label={copy.label}
        className="max-w-prose text-sm leading-6 text-foreground/70"
        role={state === 'error' ? 'alert' : 'status'}
      >
        {text}
      </p>
      {isLoading ? (
        <div aria-hidden="true" className="h-16 rounded-xl bg-[hsl(var(--surface-strong))]" />
      ) : null}
      {action ? (
        <Link
          className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
          href={action.href}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
