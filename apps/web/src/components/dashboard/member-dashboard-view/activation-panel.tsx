import { Button } from '@interdomestik/ui';

import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function ActivationPanel({ tLanding }: Readonly<{ tLanding: DashboardTranslator }>) {
  return (
    <section
      data-testid="member-activation-panel"
      className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">
            {tLanding('activation_title')}
          </p>
          <p className="max-w-2xl text-sm font-medium leading-6 text-slate-700">
            {tLanding('activation_body')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="rounded-2xl">
            <Link href="/member/membership">{tLanding('activation_primary_cta')}</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/pricing">{tLanding('activation_secondary_cta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
