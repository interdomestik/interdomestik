import { Link } from '@/i18n/routing';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Button } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function StaffDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('StaffDashboardPage');
  requireSessionOrRedirect(session, locale);

  const tNav = await getTranslations('nav');
  const tClaims = await getTranslations('agent-claims.claims');

  return (
    <div className="space-y-6" data-testid="staff-dashboard-ready">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tNav('overview')}</h1>
          <p className="text-muted-foreground">{tClaims('manage_triage')}</p>
        </div>
        <Button asChild>
          <Link href="/staff/claims">
            {tClaims('claims_queue')} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
