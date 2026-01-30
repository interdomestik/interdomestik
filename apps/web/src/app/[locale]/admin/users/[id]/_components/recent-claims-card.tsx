import { OpsStatusBadge, OpsTable, toOpsBadgeVariant } from '@/components/ops';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';

interface RecentClaim {
  id: string;
  title: string | null;
  status: string;
  claimAmount: string | null;
  currency: string | null;
  createdAt: Date | null;
}

export async function RecentClaimsCard({
  recentClaims,
  queryString,
}: {
  recentClaims: RecentClaim[];
  queryString?: string;
}) {
  const t = await getTranslations('admin.member_profile');
  const tClaims = await getTranslations('claims');
  const tCommon = await getTranslations('common');

  const withAdminContext = (href: string) => {
    if (!queryString) return href;

    const [path, destinationQuery] = href.split('?');
    const merged = new URLSearchParams(queryString);
    if (destinationQuery) {
      const destinationParams = new URLSearchParams(destinationQuery);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };

  const columns = [
    { key: 'title', header: tClaims('table.title') },
    { key: 'status', header: tClaims('table.status') },
    { key: 'created', header: tClaims('table.created') },
  ];

  const rows = recentClaims.map(claim => ({
    id: claim.id,
    cells: [
      <div key="title" className="max-w-[240px]">
        <div className="truncate" title={claim.title ?? undefined}>
          {claim.title}
        </div>
        <div className="text-xs text-muted-foreground">
          {claim.claimAmount ? `${claim.claimAmount} ${claim.currency || 'EUR'}` : tCommon('none')}
        </div>
      </div>,
      <OpsStatusBadge
        key="status"
        variant={toOpsBadgeVariant(claim.status)}
        label={tClaims(`status.${claim.status}` as any)}
        status={claim.status}
      />,
      <span key="created">{formatDate(claim.createdAt || undefined, tCommon('none'))}</span>,
    ],
    actions: (
      <Button asChild size="sm" variant="outline">
        <Link href={withAdminContext(`/admin/claims/${claim.id}`)}>{tCommon('view')}</Link>
      </Button>
    ),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.recent_claims')}</CardTitle>
      </CardHeader>
      <CardContent>
        <OpsTable
          columns={columns}
          rows={rows}
          emptyLabel={t('labels.no_claims')}
          actionsHeader={t('actions.view_claim')}
        />
      </CardContent>
    </Card>
  );
}
