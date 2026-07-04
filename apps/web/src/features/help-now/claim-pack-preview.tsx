'use client';

import { useState } from 'react';
import type { IncidentScenePack } from '@interdomestik/domain-assistance';
import type { HelpNowCopy } from './copy';
import { trackHelpNowEvent } from './analytics';
import type { HelpNowCountry, HelpNowScenario } from './content-packs';

type ClaimPackPreviewProps = {
  copy: HelpNowCopy;
  pack: IncidentScenePack | null;
  completedCount: number;
  country: HelpNowCountry;
  evidenceCount: number;
  scenario: HelpNowScenario;
};

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

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4"
      aria-labelledby="claim-pack-title"
    >
      <h2 id="claim-pack-title" className="text-lg font-semibold text-slate-950">
        {copy.packTitle}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{copy.packBody}</p>
      {!pack ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">{copy.darkTitle}</p>
          <p className="mt-1">{copy.darkBody}</p>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase text-slate-500">Zone</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-950">{pack.zone}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase text-slate-500">Checklist</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-950">{completedCount}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase text-slate-500">Local evidence</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-950">{evidenceCount}</dd>
            </div>
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
            <p className="mt-3 text-sm font-medium text-emerald-800" role="status">
              Local preview ready for {country}: {completedCount} checklist items and{' '}
              {evidenceCount} evidence notes.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
