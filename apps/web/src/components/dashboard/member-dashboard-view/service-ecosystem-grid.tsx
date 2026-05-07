import { Button, Card, CardContent } from '@interdomestik/ui';
import { ArrowRight, FileText, Headphones, HeartPulse, ShieldCheck } from 'lucide-react';

import type { DashboardTranslator } from './types';

export function ServiceEcosystemGrid({
  t,
  tLanding,
}: Readonly<{
  t: DashboardTranslator;
  tLanding: DashboardTranslator;
}>) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-display font-black tracking-tight">
          {tLanding('system_ecosystem')}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          {tLanding('explore_all')} <ArrowRight className="ml-2 w-3 h-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          {
            key: 'property_damage',
            icon: ShieldCheck,
            desc: tLanding('property_damage_desc'),
          },
          { key: 'health_safety', icon: HeartPulse, desc: tLanding('health_safety_desc') },
          { key: 'my_documents', icon: FileText, desc: tLanding('my_documents_desc') },
          { key: 'contact_center', icon: Headphones, desc: tLanding('contact_center_desc') },
        ].map((cat, i) => (
          <Card
            key={cat.key}
            className="group relative overflow-hidden bg-white/50 dark:bg-white/5 backdrop-blur-sm hover:bg-white dark:hover:bg-white/10 transition-all duration-500 cursor-pointer border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${(i + 4) * 100}ms` }}
          >
            <CardContent className="p-7 flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur group-hover:blur-md transition-all duration-500" />
                <div className="relative w-14 h-14 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                  <cat.icon className="w-7 h-7" />
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-bold block group-hover:text-primary transition-colors">
                  {t(`categories.${cat.key}`)}
                </span>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
