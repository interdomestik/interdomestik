'use client';

import { authClient } from '@/lib/auth-client';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function PortalSurfaceIndicator() {
  const pathname = usePathname();
  const t = useTranslations('dashboard.shell');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string })?.role;
  const portalKey =
    role === 'staff'
      ? 'staff'
      : role === 'agent'
        ? 'agent'
        : role === 'admin' ||
            role === 'super_admin' ||
            role === 'tenant_admin' ||
            role === 'branch_manager'
          ? 'admin'
          : 'member';
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
