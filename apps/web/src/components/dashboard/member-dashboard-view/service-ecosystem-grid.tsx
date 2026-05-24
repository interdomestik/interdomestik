import { Card, CardContent } from '@interdomestik/ui';
import { FileText, Headphones, HeartPulse, ShieldCheck } from 'lucide-react';

import type { DashboardTranslator } from './types';

export function ServiceEcosystemGrid({
  t,
  tLanding,
}: Readonly<{
  t: DashboardTranslator;
  tLanding: DashboardTranslator;
}>) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 items-center justify-between px-1">
        <h2 className="min-w-0 break-words text-xl font-display font-black tracking-tight">
          {tLanding('system_ecosystem')}
        </h2>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            key: 'property_damage',
            icon: ShieldCheck,
            desc: tLanding('property_damage_desc'),
          },
          { key: 'health_safety', icon: HeartPulse, desc: tLanding('health_safety_desc') },
          { key: 'my_documents', icon: FileText, desc: tLanding('my_documents_desc') },
          { key: 'contact_center', icon: Headphones, desc: tLanding('contact_center_desc') },
        ].map(cat => (
          <Card
            key={cat.key}
            className="relative min-w-0 overflow-hidden border-slate-200/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5"
            data-testid="member-service-ecosystem-card"
          >
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary dark:bg-primary/10">
                  <cat.icon className="h-6 w-6" />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <span className="block break-words text-sm font-bold">
                  {t(`categories.${cat.key}`)}
                </span>
                <p className="break-words text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {cat.desc}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
