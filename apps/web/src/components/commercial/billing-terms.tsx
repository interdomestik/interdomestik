import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';

export type CommercialBillingTermsSection = Readonly<{
  body: string;
  title: string;
}>;

export type CommercialBillingTermsProps = Readonly<{
  eyebrow?: string;
  footerBody: string;
  footerTitle: string;
  sectionTestId?: string;
  sections: readonly CommercialBillingTermsSection[];
  subtitle: string;
  title: string;
}>;

export function CommercialBillingTerms({
  eyebrow,
  footerBody,
  footerTitle,
  sectionTestId,
  sections,
  subtitle,
  title,
}: CommercialBillingTermsProps) {
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

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(section => (
          <Card
            key={section.title}
            className="rounded-[1.75rem] border border-slate-200 bg-white/90 shadow-none"
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-black text-slate-950">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-700">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-900 bg-slate-950 px-6 py-5 text-white">
        <h3 className="text-lg font-black">{footerTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-200">{footerBody}</p>
      </div>
    </section>
  );
}
