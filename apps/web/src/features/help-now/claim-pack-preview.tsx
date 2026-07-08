'use client';

import { useState } from 'react';
import type { IncidentScenePack } from '@interdomestik/domain-assistance';
import type { HelpNowCopy } from './copy';
import { trackHelpNowEvent } from './analytics';
import type { HelpNowCountry, HelpNowScenario } from './content-packs';
import { HelpNowMetric, HelpNowPanel } from './help-now-ui';

type ClaimPackPreviewProps = Readonly<{
  copy: HelpNowCopy;
  pack: IncidentScenePack | null;
  completedCount: number;
  country: HelpNowCountry;
  evidenceCount: number;
  scenario: HelpNowScenario;
}>;

export function ClaimPackPreview({
  copy,
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
    { label: 'Access zone', value: pack?.zone },
    { label: 'Checklist', value: completedCount },
    { label: 'Local evidence', value: evidenceCount },
  ];

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
            Generate local preview
          </button>
          {isPreviewReady ? (
            <output className="mt-3 block text-sm font-medium text-emerald-800">
              Local preview ready for {country}: {completedCount} checklist items and{' '}
              {evidenceCount} evidence notes.
            </output>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">{copy.darkTitle}</p>
          <p className="mt-1">{copy.darkBody}</p>
        </div>
      )}
    </HelpNowPanel>
  );
}
