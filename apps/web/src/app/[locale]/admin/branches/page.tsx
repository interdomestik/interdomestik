import { listBranches } from '@/actions/admin-rbac.core';
import { GlassCard } from '@/components/ui/glass-card';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ROLES } from '@interdomestik/shared-auth';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
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
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
            {t('title')}
          </h2>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <CreateBranchDialog />
      </div>

      <GlassCard className="p-1">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-xl font-semibold">{t('list_title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('list_description', { count: branches.length })}
          </p>
        </div>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-white/10">
                <TableHead>{t('table_name')}</TableHead>
                <TableHead>{t('table_code')}</TableHead>
                <TableHead>{t('table_status')}</TableHead>
                <TableHead className="text-right">{t('table_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center">
                        <ExternalLink className="h-6 w-6 opacity-50" />
                      </div>
                      <p>{t('no_branches')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                branches.map(branch => (
                  <TableRow
                    key={branch.id}
                    className="group hover:bg-white/5 dark:hover:bg-white/5 border-white/5 transition-colors"
                  >
                    <TableCell className="font-medium">
                      <span className="group-hover:text-blue-500 transition-colors">
                        {branch.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {branch.code || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={branch.isActive ? 'default' : 'secondary'}
                        className={
                          branch.isActive
                            ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20'
                            : ''
                        }
                      >
                        {branch.isActive ? t('status_active') : t('status_inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="hover:bg-blue-500/10 hover:text-blue-500"
                      >
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
        </div>
      </GlassCard>
    </div>
  );
}
