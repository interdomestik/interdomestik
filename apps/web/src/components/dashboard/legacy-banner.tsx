'use client';

import { Link } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  getCanonicalRouteForRole,
  getValidatedLocaleFromPathname,
  stripLocalePrefixFromCanonicalRoute,
} from '@/lib/canonical-routes';
import { usePathname } from 'next/navigation';

function roleFromPathname(pathname: string | null) {
  const parts = pathname?.split('/').filter(Boolean) ?? [];
  const legacyIndex = parts.indexOf('legacy');
  if (legacyIndex === -1) return null;
  return parts[legacyIndex + 1] ?? null;
}

function LegacyBannerInner({ role }: Readonly<{ role?: string }>) {
  const pathname = usePathname();
  const isLegacy = pathname?.includes('/legacy/') ?? false;

  if (!isLegacy) return null;

  const locale = getValidatedLocaleFromPathname(pathname);
  const canonical = getCanonicalRouteForRole(role ?? roleFromPathname(pathname), locale);
  const linkHref = stripLocalePrefixFromCanonicalRoute(canonical, locale);
  if (!linkHref) return null;

  return (
    <div data-testid="legacy-surface-ready">
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        data-testid="legacy-banner"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>You are viewing a legacy dashboard. Go to the v3 dashboard.</span>
          <Link
            href={linkHref}
            className="rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-white"
            data-testid="legacy-banner-link"
          >
            Go to v3 dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function LegacyBannerFromSession() {
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  return <LegacyBannerInner role={role} />;
}

export function LegacyBanner({ role }: Readonly<{ role?: string }>) {
  if (role !== undefined) {
    return <LegacyBannerInner role={role} />;
  }

  return <LegacyBannerFromSession />;
}
