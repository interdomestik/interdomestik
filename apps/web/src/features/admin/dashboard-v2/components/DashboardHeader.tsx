'use client';

import { Link } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Plus, Shield, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DashboardHeader({ tenantName, today }: { tenantName: string; today: Date }) {
  const t = useTranslations('admin.dashboard_v2.header');
  const tAdmin = useTranslations('admin.dashboard');

  // Format date using Intl
  const formattedDate = new Intl.DateTimeFormat('mk-MK', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(today);

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
            {tAdmin('title')}
          </h1>
          <Badge
            variant="outline"
            className="text-xs font-mono border-blue-500/20 text-blue-500 bg-blue-500/10"
          >
            <Shield className="mr-1 h-3 w-3" />
            {tenantName}
          </Badge>
        </div>
        <p className="text-muted-foreground font-medium">
          {formattedDate} • {t('title')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="bg-white/5 border-white/10 hover:bg-white/10"
        >
          <Link href="/admin/branches">
            <Plus className="mr-2 h-4 w-4" />
            {t('new_branch')}
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="bg-white/5 border-white/10 hover:bg-white/10"
        >
          <Link href="/admin/users?role=agent">
            <Users className="mr-2 h-4 w-4" />
            {t('agents')}
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
        >
          <Link href="/admin/leads">
            <Wallet className="mr-2 h-4 w-4" />
            {t('verify_leads')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
