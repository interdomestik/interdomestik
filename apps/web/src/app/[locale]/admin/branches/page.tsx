import { listBranches } from '@/actions/admin-rbac.core';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ROLES } from '@interdomestik/shared-auth';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { CreateBranchDialog } from './components/create-branch-dialog';

export default async function AdminBranchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await import('next/headers').then(m => m.headers()),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // Only Admin/SuperAdmin/TenantAdmin should access this list page
  const userRole = session.user.role;
  if (
    userRole !== ROLES.super_admin &&
    userRole !== ROLES.admin &&
    userRole !== ROLES.tenant_admin
  ) {
    // Branch manager should be redirected to their specific dashboard if they try to access list
    if (userRole === ROLES.branch_manager && session.user.branchId) {
      redirect(`/${locale}/admin/branches/${session.user.branchId}`);
    }
    notFound();
  }

  const t = await getTranslations('admin.branches');
  const result = await listBranches({ includeInactive: true });

  const branches = result.success ? (result.data ?? []) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <CreateBranchDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('list_title')}</CardTitle>
          <CardDescription>{t('list_description', { count: branches.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table_name')}</TableHead>
                <TableHead>{t('table_code')}</TableHead>
                <TableHead>{t('table_status')}</TableHead>
                <TableHead className="text-right">{t('table_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('no_branches')}
                  </TableCell>
                </TableRow>
              ) : (
                branches.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{branch.code || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                        {branch.isActive ? t('status_active') : t('status_inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/branches/${branch.id}`}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('view_dashboard')}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
