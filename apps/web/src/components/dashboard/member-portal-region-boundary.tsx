import { RefractiveGlassPanel } from '@interdomestik/ui';

export type MemberPortalRegionCopy = Readonly<{
  empty: string;
  error: string;
  label: string;
  loading: string;
}>;

export function MemberPortalRegionBoundary({
  copy,
  state,
}: Readonly<{
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
    </RefractiveGlassPanel>
  );
}
