import { Button, Card } from '@interdomestik/ui';
import { LayoutDashboard } from 'lucide-react';

import { ReferralCard } from '@/components/member/referral-card';
import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function ReferralStatusColumn({
  isAgentRole,
  supportHref,
  tLanding,
}: Readonly<{
  isAgentRole: boolean;
  supportHref: string;
  tLanding: DashboardTranslator;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <ReferralCard isAgent={isAgentRole} />
      <Card className="relative min-w-0 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-950/60">
        <div className="relative min-w-0 space-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="shrink-0 rounded-2xl bg-sky-50 p-3 dark:bg-sky-400/10">
              <LayoutDashboard className="h-6 w-6 text-sky-700 dark:text-sky-300" />
            </div>
            <h3 className="min-w-0 break-words text-lg font-display font-black text-foreground">
              {tLanding('status_insight_title')}
            </h3>
          </div>
          <p className="break-words text-sm font-medium leading-relaxed text-muted-foreground">
            {tLanding('status_insight_body')}
          </p>
          <Button variant="secondary" asChild className="w-full min-w-0 rounded-xl font-bold">
            <Link href={supportHref} className="min-w-0 break-words">
              {tLanding('review_security_parameters')}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
