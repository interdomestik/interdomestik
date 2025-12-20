import { ClaimsFilters } from '@/components/dashboard/claims/claims-filters';
import { MemberClaimsTable } from '@/components/dashboard/claims/member-claims-table';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function ClaimsPage() {
  const t = await getTranslations('claims');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/claims/new">
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
