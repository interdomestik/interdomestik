import { ClaimStatusBadge } from '@/features/claims/tracking/components/ClaimStatusBadge';
import { Link } from '@/i18n/routing';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { Avatar, AvatarFallback } from '@interdomestik/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/card';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { buildAgentWorkspaceClaimHref, getAgentClaimsCore } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

// Helper for initials
function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

// Minimal placeholder auth
async function getAuth() {
  try {
    return await authorizeSessionTenant(await headers());
  } catch {
    return null;
  }
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AgentClaimsPage({
  params,
  searchParams,
}: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  await searchParams;
  const t = await getTranslations({ locale, namespace: 'agent' });
  const authorized = await getAuth();
  if (!authorized) redirect(`/${locale}/login`);

  const { session, authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);
  const result = await withTenantAuthority(authority, tx =>
    getAgentClaimsCore({
      tenantId,
      userId: session.user.id,
      role: session.user.role,
      branchId: session.user.branchId,
      db: tx,
    })
  );

  if (!result.ok) {
    if (result.code === 'FORBIDDEN') return notFound();
    throw new Error('Internal Server Error');
  }

  const groups = result.data;

  return (
    <div
      className="min-w-0 py-4 space-y-8 [overflow-wrap:anywhere]"
      data-testid="agent-claims-page"
    >
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('claimsPage.title')}</h1>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="agent-claims-empty">
          {t('claimsPage.empty')}
        </div>
      ) : (
        <div className="grid gap-6">
          {groups.map(group => (
            <Card key={group.memberId} className="overflow-hidden">
              <CardHeader className="bg-muted/40 pb-4">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar>
                    <AvatarFallback>{getInitials(group.memberName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">{group.memberName}</CardTitle>
                    <p className="text-sm text-muted-foreground">{group.memberEmail}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {group.claims.map(claim => (
                    <Link
                      href={buildAgentWorkspaceClaimHref(claim.id)}
                      locale={locale}
                      key={claim.id}
                      className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/20 transition-colors"
                      data-testid="agent-claim-row"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{claim.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(claim.createdAt).toLocaleDateString(locale)}
                        </p>
                      </div>
                      <ClaimStatusBadge
                        status={
                          claim.status as import('@interdomestik/database/constants').ClaimStatus
                        }
                      />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
