'use client';

import { authClient } from '@/lib/auth-client';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type PortalKey = 'member' | 'agent' | 'staff' | 'admin';
const SUPPORTED_LOCALES = new Set(['sq', 'en', 'sr', 'mk']);

function inferPortalKeyFromPath(pathname: string | null): PortalKey | null {
  if (!pathname) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const routeSegments = SUPPORTED_LOCALES.has(segments[0]) ? segments.slice(1) : segments;

  const [surface] = routeSegments;
  if (surface === 'staff') return 'staff';
  if (surface === 'agent') return 'agent';
  if (surface === 'admin') return 'admin';
  if (surface === 'member') return 'member';

  return null;
}

function inferPortalKeyFromRole(role: string | undefined): PortalKey | null {
  if (role === 'staff') return 'staff';
  if (role === 'agent') return 'agent';
  if (
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'tenant_admin' ||
    role === 'branch_manager'
  ) {
    return 'admin';
  }

  return null;
}

export function PortalSurfaceIndicator() {
  const pathname = usePathname();
  const t = useTranslations('dashboard.shell');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string })?.role;
  const pathPortalKey = inferPortalKeyFromPath(pathname);
  const portalKey = pathPortalKey ?? inferPortalKeyFromRole(role) ?? 'member';
  const isLegacy = pathname?.includes('/legacy/') ?? false;
  const showSurfaceBadge = process.env.NODE_ENV !== 'production';

  return (
    <div
      className="flex items-center gap-3 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground"
      data-testid="portal-surface-indicator"
    >
      <span>{t('portal_label', { portal: t(`portal.${portalKey}`) })}</span>
      {showSurfaceBadge ? (
        <span className={isLegacy ? 'text-amber-600' : 'text-emerald-600'}>
          {t('surface_label', { surface: isLegacy ? t('surface.legacy') : t('surface.v3') })}
        </span>
      ) : null}
    </div>
  );
}
