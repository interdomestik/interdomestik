import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowRightLeft, CircleOff, ShieldCheck } from 'lucide-react';

export type ScopeGroupTone = 'launch' | 'guidance' | 'outOfScope';

export type ScopeGroup = Readonly<{
  description: string;
  items: readonly string[];
  note: string;
  title: string;
  tone: ScopeGroupTone;
}>;

export type ClaimScopeTreeProps = Readonly<{
  boundaryItems: readonly string[];
  boundaryTitle: string;
  boundaryBody: string;
  eyebrow?: string;
  groups: readonly ScopeGroup[];
  sectionTestId?: string;
  subtitle: string;
  title: string;
}>;

const GROUP_STYLES: Record<
  ScopeGroupTone,
  Readonly<{
    borderClassName: string;
    icon: typeof ShieldCheck;
    iconClassName: string;
  }>
> = {
  launch: {
    borderClassName: 'border-emerald-200 bg-emerald-50/60',
    icon: ShieldCheck,
    iconClassName: 'text-emerald-700',
  },
  guidance: {
    borderClassName: 'border-amber-200 bg-amber-50/60',
    icon: ArrowRightLeft,
    iconClassName: 'text-amber-700',
  },
  outOfScope: {
    borderClassName: 'border-slate-200 bg-slate-50',
    icon: CircleOff,
    iconClassName: 'text-slate-700',
  },
};

export function ClaimScopeTree({
  boundaryItems,
  boundaryTitle,
  boundaryBody,
  eyebrow,
  groups,
  sectionTestId,
  subtitle,
  title,
}: ClaimScopeTreeProps) {
  return (
    <section
      className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-6 shadow-sm md:p-8"
      data-testid={sectionTestId}
    >
      <div className="mx-auto max-w-4xl text-center">
        {eyebrow ? (
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">{subtitle}</p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {groups.map(group => {
          const styles = GROUP_STYLES[group.tone];
          const Icon = styles.icon;

          return (
            <Card
              key={group.title}
              className={`rounded-[1.75rem] border ${styles.borderClassName} shadow-none`}
            >
              <CardHeader className="space-y-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
                    <Icon className={`h-5 w-5 ${styles.iconClassName}`} />
                  </div>
                </div>
                <div>
                  <CardTitle className="text-xl font-black text-slate-950">{group.title}</CardTitle>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{group.description}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {group.items.map(item => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-medium leading-6 text-slate-700">
                  {group.note}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white">
        <div className="max-w-3xl">
          <h3 className="text-lg font-black">{boundaryTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-200">{boundaryBody}</p>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {boundaryItems.map(item => (
            <li
              key={item}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-100"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
