import { Link } from '@/i18n/routing';
import {
  getCanonicalRouteForRole,
  stripLocalePrefixFromCanonicalRoute,
} from '@/lib/canonical-routes';
import AgentDashboardEntry from '@/app/[locale]/(agent)/agent/_core.entry';

export default async function LegacyAgentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const canonical = getCanonicalRouteForRole('agent', locale);
  const linkHref = stripLocalePrefixFromCanonicalRoute(canonical, locale);

  return (
    <>
      {linkHref ? (
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
      ) : null}
      <AgentDashboardEntry params={params} />
    </>
  );
}
