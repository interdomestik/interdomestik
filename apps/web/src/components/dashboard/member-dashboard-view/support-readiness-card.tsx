import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowRight, Headphones } from 'lucide-react';

import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function SupportReadinessCard({
  isActive,
  supportHref,
  tLanding,
}: Readonly<{
  isActive: boolean;
  supportHref: string;
  tLanding: DashboardTranslator;
}>) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/60">
      <CardHeader className="p-6 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 break-words text-sm font-black uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
          <Headphones className="h-4 w-4 shrink-0" />
          {tLanding('support_panel_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6 pt-0">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span className="min-w-0 break-words">{tLanding('support_readiness_label')}</span>
              <span
                className={`min-w-0 break-words ${isActive ? 'text-emerald-500' : 'text-amber-500'}`}
              >
                {isActive
                  ? tLanding('support_readiness_active')
                  : tLanding('support_readiness_pending')}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
              <div
                className={`h-full motion-safe:transition-all motion-safe:duration-700 ${
                  isActive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: isActive ? '100%' : '65%' }}
              />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
              <span className="mb-1 block break-words text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {tLanding('support_channel_label')}
              </span>
              <span className="break-words text-base font-display font-black sm:text-lg">
                {tLanding('support_channel_value')}
              </span>
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
              <span className="mb-1 block break-words text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {tLanding('support_window_label')}
              </span>
              <span className="break-words text-base font-display font-black sm:text-lg">
                {tLanding('support_window_value')}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="break-words text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {tLanding('support_highlights_title')}
          </h4>
          <div className="space-y-3">
            {[
              tLanding('support_highlight_one'),
              tLanding('support_highlight_two'),
              tLanding('support_highlight_three'),
            ].map(item => (
              <div key={item} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-xs font-bold">{item}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {tLanding('online_now')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          className="w-full min-w-0 rounded-2xl border-sky-200 font-bold motion-safe:transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-sky-400/20 dark:hover:bg-sky-400/5"
        >
          <Link href={supportHref} className="flex min-w-0 items-center justify-center gap-2">
            <span className="min-w-0 break-words">{tLanding('support_panel_cta')}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
