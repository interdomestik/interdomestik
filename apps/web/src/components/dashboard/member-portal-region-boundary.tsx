import { RefractiveGlassPanel } from '@interdomestik/ui';

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
  const role = { empty: 'status', error: 'alert', loading: undefined } as const;

  return (
    <RefractiveGlassPanel className="space-y-3 shadow-none" data-region-state={state}>
      <h2 className="text-lg font-semibold tracking-tight">{copy.label}</h2>
      <p
        aria-label={copy.label}
        className="max-w-prose text-sm leading-6 text-foreground/70"
        role={role[state]}
      >
        {text}
      </p>
      {action ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-[hsl(var(--border-strong))] px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText]"
          href={action.href}
        >
          {action.label}
        </Link>
      ) : null}
    </RefractiveGlassPanel>
  );
}
