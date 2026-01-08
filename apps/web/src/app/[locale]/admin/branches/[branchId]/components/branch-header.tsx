import type { BranchMetadata } from '@/actions/branch-dashboard.types';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Building2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface BranchHeaderProps {
  branch: BranchMetadata;
}

export async function BranchHeader({ branch }: BranchHeaderProps) {
  const t = await getTranslations('admin.branches.dashboard');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle as="h1" className="text-2xl">
              {branch.name}
            </CardTitle>
            <Badge variant={branch.isActive ? 'default' : 'secondary'}>
              {branch.isActive ? t('status_active') : t('status_inactive')}
            </Badge>
          </div>
          {branch.code && (
            <CardDescription className="mt-1">
              {t('code_label')}: {branch.code}
            </CardDescription>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
