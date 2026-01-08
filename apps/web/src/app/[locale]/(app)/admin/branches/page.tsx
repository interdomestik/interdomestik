import { listBranches } from '@/actions/admin-rbac';
import { BranchesTable } from '@/components/admin/branches/branches-table';
import { CreateBranchDialog } from '@/components/admin/branches/create-branch-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBranchesPage({ searchParams }: Readonly<Props>) {
  const t = await getTranslations('admin.branches');
  const sp = await searchParams;
  const showInactive = sp.showInactive === 'true';
  const result = await listBranches({ includeInactive: showInactive });
  const branches = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <CreateBranchDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <BranchesTable initialData={branches} />
        </CardContent>
      </Card>
    </div>
  );
}
