'use client';

import { useRef, useState } from 'react';
import {
  canExposeCountryPack,
  getTripModeDownloadAssets,
  type HelpNowCountry,
  type HelpNowCountryPack,
} from './content-packs';
import type { HelpNowCopy } from './copy';
import { saveTripModePackForOffline, type OfflineSaveResult } from './offline';
import { trackHelpNowEvent } from './analytics';
import { HelpNowPanel } from './help-now-ui';

type TripModeStatus = OfflineSaveResult;
const tripModeAssetCount = getTripModeDownloadAssets().length;

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
  const [isSaving, setIsSaving] = useState(false);
  const currentPack = packs.find(pack => pack.country === country && canExposeCountryPack(pack));
  // Keep a synchronous lock for same-tick clicks while state drives disabled UI feedback.
  const isSavingRef = useRef(false);

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
          if (isSavingRef.current) return;
          isSavingRef.current = true;
          setIsSaving(true);
          try {
            const result = await saveTripModePackForOffline();
            setStatus(result);
            if (result === 'saved') {
              trackHelpNowEvent('trip_pack_downloaded', {
                country,
                pack_count: tripModeAssetCount,
                total_mb_bucket: 'under_1',
              });
            }
          } finally {
            isSavingRef.current = false;
            setIsSaving(false);
          }
        }}
        disabled={isSaving}
        className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {copy.download}
      </button>
      {status ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 text-sm font-medium ${
            status === 'saved' ? 'text-emerald-800' : 'text-amber-900'
          }`}
        >
          {getStatusMessage(copy, status)}
        </p>
      ) : null}
      <div
        className={`mt-4 rounded-md border p-3 text-sm ${
          currentPack
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
            : 'border-amber-200 bg-amber-50 text-amber-950'
        }`}
      >
        <p className="font-semibold">{currentPack ? copy.signedTitle : copy.darkTitle}</p>
        <p className="mt-1">{currentPack ? copy.signedBody : copy.darkBody}</p>
        <p className="mt-2 text-xs font-semibold">Signed packs: {packs.length}</p>
      </div>
    </HelpNowPanel>
  );
}
