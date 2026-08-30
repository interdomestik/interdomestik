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
  const text = state === 'empty' ? copy.empty : state === 'error' ? copy.error : copy.loading;
  const role = state === 'error' ? 'alert' : state === 'empty' ? 'status' : undefined;

  return (
    <RefractiveGlassPanel data-region-state={state}>
      <p aria-label={copy.label} className="text-sm text-foreground/70" role={role}>
        {text}
      </p>
    </RefractiveGlassPanel>
  );
}
