import { Button } from '@interdomestik/ui';
import { ArrowRight, Globe } from 'lucide-react';

import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function DiasporaRibbon({
  t,
  tLanding,
}: Readonly<{
  t: DashboardTranslator;
  tLanding: DashboardTranslator;
}>) {
  return (
    <div className="group relative min-w-0 max-w-full cursor-pointer" data-testid="diaspora-ribbon">
      <div className="relative min-w-0 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:border-sky-200 dark:border-white/10 dark:bg-slate-950/60">
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
              <Globe className="h-7 w-7" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="break-words text-lg font-display font-bold text-foreground">
                {t('diaspora_ribbon.text')}
              </h3>
              <p className="break-words text-sm leading-relaxed text-muted-foreground">
                {tLanding('diaspora_description')}
              </p>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="group/btn w-full min-w-0 rounded-2xl px-8 shadow-sm transition-all active:scale-95 sm:w-auto"
            data-testid="diaspora-ribbon-cta"
          >
            <Link
              href="/member/diaspora"
              className="flex min-w-0 items-center justify-center gap-3"
            >
              <span className="min-w-0 break-words font-bold">{t('diaspora_ribbon.cta')}</span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover/btn:translate-x-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
