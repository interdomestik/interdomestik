'use client';

import { useState } from 'react';
import type { IncidentScenePack } from '@interdomestik/domain-assistance';
import { PUBLIC_FREE_START_ENTRY_HREF } from '@/lib/public-membership-entry';
import type { HelpNowCopy } from './copy';
import { trackHelpNowEvent } from './analytics';
import type { HelpNowContentLocale, HelpNowCountry, HelpNowScenario } from './content-packs';
import { HelpNowMetric, HelpNowPanel } from './help-now-ui';

type ClaimPackPreviewProps = Readonly<{
  copy: HelpNowCopy;
  locale: HelpNowContentLocale;
  pack: IncidentScenePack | null;
  completedCount: number;
  country: HelpNowCountry;
  evidenceCount: number;
  scenario: HelpNowScenario;
}>;

type HelpNowContinuationProps = Readonly<{
  copy: HelpNowCopy;
  locale: HelpNowContentLocale;
}>;

// Native link only: no click handler, query or state transfer to the separate organizer.
function HelpNowContinuation({ copy, locale }: HelpNowContinuationProps) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p id="help-now-continue-note" className="text-sm text-slate-600">
        {copy.continueNote}
      </p>
      <a
        href={`/${locale}${PUBLIC_FREE_START_ENTRY_HREF}`}
        data-testid="help-now-continue"
        aria-describedby="help-now-continue-note"
        className="mt-3 inline-flex rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
      >
        {copy.continueLink}
      </a>
    </div>
  );
}

export function ClaimPackPreview({
  copy,
  locale,
  pack,
  completedCount,
  country,
  evidenceCount,
  scenario,
}: ClaimPackPreviewProps) {
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  function handleGeneratePreview() {
    if (!pack) return;

    setIsPreviewReady(true);
    trackHelpNowEvent('claim_pack_generated', {
      country,
      has_bundle: evidenceCount > 0,
      scenario,
    });
  }

  const metrics = [
    ...(pack?.zone === 'free' ? [{ label: copy.metricGuidance, value: copy.guidanceFree }] : []),
    { label: copy.metricChecklist, value: completedCount },
    { label: copy.metricFiles, value: evidenceCount },
  ];
  const previewSummary = [
    copy.previewReady,
    `${copy.countryLabel}: ${copy.countries[country]}`,
    `${copy.metricChecklist}: ${completedCount}`,
    `${copy.metricFiles}: ${evidenceCount}`,
  ].join(' · ');

  return (
    <HelpNowPanel title={copy.packTitle} titleId="claim-pack-title">
      <p className="mt-1 text-sm text-slate-600">{copy.packBody}</p>
      {pack ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {metrics.map(metric => (
              <HelpNowMetric key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </dl>
          <button
            type="button"
            data-testid="help-now-generate-pack"
            onClick={handleGeneratePreview}
            className="mt-4 rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900"
          >
            {copy.generate}
          </button>
          {isPreviewReady ? (
            <output className="mt-3 block text-sm font-medium text-emerald-800">
              {previewSummary}
            </output>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">{copy.darkTitle}</p>
          <p className="mt-1">{copy.darkBody}</p>
        </div>
      )}
      <HelpNowContinuation copy={copy} locale={locale} />
    </HelpNowPanel>
  );
}
