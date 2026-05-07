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
    <Card className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/60">
      <CardHeader className="p-8 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
          <Headphones className="w-4 h-4" />
          {tLanding('support_panel_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8 pt-0 space-y-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>{tLanding('support_readiness_label')}</span>
              <span className={isActive ? 'text-emerald-500' : 'text-amber-500'}>
                {isActive
                  ? tLanding('support_readiness_active')
                  : tLanding('support_readiness_pending')}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
              <div
                className={`h-full transition-all duration-1000 ${
                  isActive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: isActive ? '100%' : '65%' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {tLanding('support_channel_label')}
              </span>
              <span className="text-xl font-display font-black">
                {tLanding('support_channel_value')}
              </span>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {tLanding('support_window_label')}
              </span>
              <span className="text-xl font-display font-black">
                {tLanding('support_window_value')}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {tLanding('support_highlights_title')}
          </h4>
          <div className="space-y-3">
            {[
              tLanding('support_highlight_one'),
              tLanding('support_highlight_two'),
              tLanding('support_highlight_three'),
            ].map(item => (
              <div key={item} className="flex items-center justify-between">
                <span className="text-xs font-bold">{item}</span>
                <div className="flex items-center gap-2">
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
          className="w-full rounded-2xl border-sky-200 font-bold transition-all hover:border-sky-300 hover:bg-sky-50 dark:border-sky-400/20 dark:hover:bg-sky-400/5"
        >
          <Link href={supportHref} className="flex items-center justify-center gap-2">
            <span>{tLanding('support_panel_cta')}</span>
            <ArrowRight className="w-4 h-4 transition-transform" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
