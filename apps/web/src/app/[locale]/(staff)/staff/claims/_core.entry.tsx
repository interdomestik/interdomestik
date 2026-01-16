import { AgentClaimsFilters } from '@/components/agent/agent-claims-filters';
import { AgentClaimsTable } from '@/components/agent/agent-claims-table';
import { Link, redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { badgeVariants } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    queue?: string;
    status?: string;
    search?: string;
    page?: string;
  }>;
};

export default async function StaffClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  if (session.user.role !== 'staff') {
    if (session.user.role === 'admin') {
      redirect({ href: '/admin', locale });
    } else if (session.user.role === 'agent') {
      redirect({ href: '/agent', locale });
    } else {
      redirect({ href: '/member', locale });
    }
    return null;
  }

  const tClaims = await getTranslations('agent-claims.claims');

  const queueParam = query.queue;
  let queue: 'unassigned' | 'mine' | 'all' = 'unassigned';
  let scope: 'staff_queue' | 'staff_all' | 'staff_unassigned' = 'staff_unassigned';

  if (queueParam === 'mine') {
    queue = 'mine';
    scope = 'staff_queue';
  } else if (queueParam === 'all') {
    queue = 'all';
    scope = 'staff_all';
  }

  const buildQueueHref = (nextQueue: 'unassigned' | 'mine' | 'all') => {
    const params = new URLSearchParams();
    params.set('queue', nextQueue);
    if (query.status) params.set('status', query.status);
    if (query.search) params.set('search', query.search);
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tClaims('queue')}</h1>
        <p className="text-muted-foreground">{tClaims('manage_triage')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={buildQueueHref('unassigned')}
          className={badgeVariants({
            variant: queue === 'unassigned' ? 'default' : 'outline',
          })}
        >
          Unassigned
        </Link>
        <Link
          href={buildQueueHref('mine')}
          className={badgeVariants({
            variant: queue === 'mine' ? 'default' : 'outline',
          })}
        >
          My Queue
        </Link>
        <Link
          href={buildQueueHref('all')}
          className={badgeVariants({
            variant: queue === 'all' ? 'default' : 'outline',
          })}
        >
          All
        </Link>
      </div>

      <AgentClaimsFilters />
      <AgentClaimsTable scope={scope} detailBasePath="/staff/claims" userRole="staff" />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
