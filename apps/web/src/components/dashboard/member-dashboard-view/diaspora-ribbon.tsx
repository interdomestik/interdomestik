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
    <div className="relative group cursor-pointer" data-testid="diaspora-ribbon">
      <div className="relative rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:border-sky-200 dark:border-white/10 dark:bg-slate-950/60">
        <div className="flex items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
            <Globe className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-display font-bold text-foreground">
              {t('diaspora_ribbon.text')}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tLanding('diaspora_description')}
            </p>
          </div>
        </div>
        <Button
          asChild
          size="lg"
          className="rounded-2xl px-8 group/btn shadow-sm transition-all active:scale-95"
          data-testid="diaspora-ribbon-cta"
        >
          <Link href="/member/diaspora" className="flex items-center gap-3">
            <span className="font-bold">{t('diaspora_ribbon.cta')}</span>
            <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
