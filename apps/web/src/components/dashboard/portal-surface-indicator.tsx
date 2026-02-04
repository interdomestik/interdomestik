'use client';

import { authClient } from '@/lib/auth-client';
import { getPortalLabel } from '@/lib/canonical-routes';
import { usePathname } from 'next/navigation';

export function PortalSurfaceIndicator() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string })?.role;
  const portal = getPortalLabel(role);
  const isLegacy = pathname?.includes('/legacy/') ?? false;

  return (
    <div
      className="hidden items-center gap-3 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground md:flex"
      data-testid="portal-surface-indicator"
    >
      <span>Portal: {portal}</span>
      <span className={isLegacy ? 'text-amber-600' : 'text-emerald-600'}>
        Surface: {isLegacy ? 'legacy' : 'v3'}
      </span>
    </div>
  );
}
