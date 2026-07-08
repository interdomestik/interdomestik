'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { FileText, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';

import { THIRD_PARTY_COST_TREATMENT, type FeeMathSheetCopy } from './fee-math-sheet-copy';
import { trackFeeSheetViewed } from './fee-math-sheet-instrumentation';
import type { FeeSheetViewedProperties } from './fee-math-sheet-instrumentation';

type FeeMathSheetDisclosureProps = Readonly<{
  context: FeeSheetViewedProperties['context'];
  copy: FeeMathSheetCopy;
  locale: string;
  sourceSurface: string;
}>;

export function FeeMathSheetDisclosure({
  context,
  copy,
  locale,
  sourceSurface,
}: FeeMathSheetDisclosureProps) {
  useEffect(() => {
    trackFeeSheetViewed({
      context,
      locale,
      source_surface: sourceSurface,
      third_party_cost_mode: THIRD_PARTY_COST_TREATMENT.mode,
      offline_available: true,
    });
  }, [context, locale, sourceSurface]);

  return (
    <Card
      className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white/95 shadow-none"
      data-testid="fee-math-sheet-court-costs"
    >
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <FileText className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              {copy.eyebrow}
            </p>
            <CardTitle className="mt-2 text-xl font-black text-slate-950">{copy.title}</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.body}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          <ShieldCheck className="h-4 w-4" />
          {copy.treatmentLabel}
        </div>
        <dl className="grid gap-3 md:grid-cols-2">
          {copy.rows.map(row => (
            <div
              key={row.key}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              data-copy-key={row.key}
            >
              <dt className="text-sm font-black text-slate-950">{row.label}</dt>
              <dd className="mt-1 text-sm leading-6 text-slate-600">{row.body}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
