import { ClaimsFilters } from '@/components/dashboard/claims/claims-filters';
import { MemberClaimsTable } from '@/components/dashboard/claims/member-claims-table';
import { Link, redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Button } from '@interdomestik/ui';
import { Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function ClaimsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  // Only members (or default users) should access this page
  // Staff uses /staff/claims, agents don't handle claims here
  const isMember = session.user.role === 'user' || session.user.role === 'member';

  if (!isMember) {
    if (session.user.role === 'agent') {
      redirect({ href: '/agent', locale });
    } else if (session.user.role === 'staff') {
      redirect({ href: '/staff/claims', locale });
    } else if (session.user.role === 'admin') {
      redirect({ href: '/admin', locale });
    }
    // Fallback for unknown roles
    console.warn(`[ClaimsPage] Access denied for role: ${session.user.role}`);
    return null;
  }

  const t = await getTranslations('claims');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" data-testid="claims-title">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/member/claims/new" data-testid="create-claim-button">
            <Plus className="mr-2 h-4 w-4" />
            {t('new')}
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <ClaimsFilters />

      <MemberClaimsTable />
    </div>
  );
}
