'use client';

import { useState } from 'react';
import type { HelpNowCountry, HelpNowCountryPack } from './content-packs';
import type { HelpNowCopy } from './copy';
import { saveTripModePackForOffline } from './offline';
import { trackHelpNowEvent } from './analytics';
import { HelpNowPanel } from './help-now-ui';

type TripModeStatus = 'saved' | 'unsupported' | 'failed';

type TripModeProps = Readonly<{
  copy: HelpNowCopy;
  country: HelpNowCountry;
  packs: readonly HelpNowCountryPack[];
}>;

function getStatusMessage(copy: HelpNowCopy, status: TripModeStatus): string {
  if (status === 'saved') return copy.downloadDone;
  if (status === 'unsupported') return copy.downloadUnsupported;
  return copy.downloadFailed;
}

export function TripMode({ copy, country, packs }: TripModeProps) {
  const [status, setStatus] = useState<TripModeStatus | null>(null);

  return (
    <HelpNowPanel title="Trip Mode" titleId="trip-mode-title">
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
          setStatus(result);
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
      {status ? (
        <p
          className={`mt-3 text-sm font-medium ${
            status === 'saved' ? 'text-emerald-800' : 'text-amber-900'
          }`}
        >
          {getStatusMessage(copy, status)}
        </p>
      ) : null}
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">{copy.darkTitle}</p>
        <p className="mt-1">{copy.darkBody}</p>
        <p className="mt-2 text-xs font-semibold">Signed packs: {packs.length}</p>
      </div>
    </HelpNowPanel>
  );
}
