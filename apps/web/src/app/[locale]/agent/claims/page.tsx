import { ClaimStatusBadge } from '@/features/claims/tracking/components/ClaimStatusBadge';
import { db } from '@/lib/db.server';
import { Avatar, AvatarFallback } from '@interdomestik/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/card';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAgentClaimsCore } from './_core';

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

export default async function AgentClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  await searchParams;
  const session = await getAuth();
  if (!session) redirect(`/${locale}/login`);

  const result = await getAgentClaimsCore({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role: session.user.role,
    branchId: session.user.branchId,
    db,
  });

  if (!result.ok) {
    if (result.code === 'FORBIDDEN') return notFound();
    throw new Error('Internal Server Error');
  }

  const groups = result.data;

  return (
    <div className="container py-8 space-y-8" data-testid="agent-claims-page">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Client Claims</h1>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="agent-claims-empty">
          No clients with claims found.
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
                      href={`/${locale}/member/claims/${claim.id}`}
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
