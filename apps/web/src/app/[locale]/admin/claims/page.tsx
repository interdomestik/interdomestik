import { AdminClaimsFilters } from '@/components/admin/claims/claims-filters';
import { AdminClaimsTable } from '@/components/admin/admin-claims-table';
import { getTranslations } from 'next-intl/server';

export default async function AdminClaimsPage() {
  const tAdmin = await getTranslations('admin.claims_page');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tAdmin('title')}</h1>
        <p className="text-muted-foreground">{tAdmin('description')}</p>
      </div>

      <AdminClaimsFilters />
      <AdminClaimsTable />
    </div>
  );
}
