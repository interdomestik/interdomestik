import { ClaimStatusBadge } from '@/features/claims/tracking/components/ClaimStatusBadge';
import { Link } from '@/i18n/routing';
import { ensureTenantId } from '@interdomestik/shared-auth';
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { buildAgentWorkspaceClaimHref, getAgentClaimsCore } from './_core';

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
    const { auth } = await import('@/lib/auth');
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Request-specific auth is read behind this boundary so the page shell can prerender.
export default function AgentClaimsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <output
          aria-busy="true"
          className="container block py-8"
          data-testid="agent-claims-loading"
        >
          <div aria-hidden="true" className="h-9 w-64 animate-pulse rounded bg-muted" />
          <div aria-hidden="true" className="mt-8 h-40 animate-pulse rounded bg-muted" />
        </output>
      }
    >
      <AgentClaimsContent {...props} />
    </Suspense>
  );
}

async function AgentClaimsContent({ params, searchParams }: Props) {
  const { locale } = await params;
  await searchParams;
  const t = await getTranslations('agent');
  const session = await getAuth();
  if (!session) redirect(`/${locale}/login`);

  const result = await getAgentClaimsCore({
    tenantId: ensureTenantId(session),
    userId: session.user.id,
    role: session.user.role,
    branchId: session.user.branchId,
  });

  if (!result.ok) {
    if (result.code === 'FORBIDDEN') return notFound();
    throw new Error('Internal Server Error');
  }

  const groups = result.data;

  return (
    <div className="container py-8 space-y-8" data-testid="agent-claims-page">
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
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>{getInitials(group.memberName)}</AvatarFallback>
                  </Avatar>
                  <div>
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
                      className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                      data-testid="agent-claim-row"
                    >
                      <div className="space-y-1">
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
