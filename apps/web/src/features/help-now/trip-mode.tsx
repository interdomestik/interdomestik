'use client';

import { useState } from 'react';
import type { HelpNowCountry, HelpNowCountryPack } from './content-packs';
import type { HelpNowCopy } from './copy';
import { saveTripModePackForOffline } from './offline';
import { trackHelpNowEvent } from './analytics';

type TripModeProps = {
  copy: HelpNowCopy;
  country: HelpNowCountry;
  packs: readonly HelpNowCountryPack[];
};

export function TripMode({ copy, country, packs }: TripModeProps) {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4"
      aria-labelledby="trip-mode-title"
    >
      <h2 id="trip-mode-title" className="text-lg font-semibold text-slate-950">
        Trip Mode
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {copy.tripChecklist.map(item => (
          <div
            key={item}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            {item}
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="help-now-trip-download"
        onClick={async () => {
          const result = await saveTripModePackForOffline();
          setStatus(result === 'saved' ? copy.downloadDone : 'Offline save is unavailable here.');
          if (result === 'saved') {
            trackHelpNowEvent('trip_pack_downloaded', {
              country,
              pack_count: 1,
              total_mb_bucket: 'under_1',
            });
          }
        }}
        className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
      >
        {copy.download}
      </button>
      {status ? <p className="mt-3 text-sm font-medium text-emerald-800">{status}</p> : null}
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">{copy.darkTitle}</p>
        <p className="mt-1">{copy.darkBody}</p>
        <p className="mt-2 text-xs font-semibold">Signed packs: {packs.length}</p>
      </div>
    </section>
  );
}
