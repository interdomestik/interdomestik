'use client';

import { useEffect, useState } from 'react';
import {
  clearEvidenceItems,
  listEvidenceItems,
  saveEvidenceItem,
  type EvidenceItem,
} from './evidence-store';
import type { HelpNowCopy } from './copy';
import { trackHelpNowEvent } from './analytics';
import { HelpNowPanel } from './help-now-ui';

type EvidenceCoachProps = Readonly<{
  copy: HelpNowCopy;
  onBundleChange: (count: number) => void;
}>;

function bucketFor(count: number): '0' | '1_2' | '3_5' | '6_plus' {
  if (count === 0) return '0';
  if (count <= 2) return '1_2';
  if (count <= 5) return '3_5';
  return '6_plus';
}

export function EvidenceCoach({ copy, onBundleChange }: EvidenceCoachProps) {
  const [items, setItems] = useState<EvidenceItem[]>([]);

  useEffect(() => {
    const currentItems = listEvidenceItems();
    setItems(currentItems);
    onBundleChange(currentItems.length);
  }, [onBundleChange]);

  return (
    <HelpNowPanel titleId="evidence-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="evidence-title" className="text-lg font-semibold text-slate-950">
            Evidence Coach
          </h2>
          <p className="mt-1 text-sm text-slate-600">{copy.privacy}</p>
        </div>
        <button
          type="button"
          data-testid="help-now-clear-bundle"
          onClick={() => {
            clearEvidenceItems();
            setItems([]);
            onBundleChange(0);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
        >
          {copy.clear}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {copy.shots.map((shot, index) => {
          const existing = items.find(item => item.promptId === `shot-${index}`);
          return (
            <label key={shot} className="rounded-md border border-slate-200 p-3 text-sm">
              <span className="block font-semibold text-slate-900">{shot}</span>
              <span className="mt-1 block text-slate-600">
                {existing
                  ? `${existing.fileName} · ${new Date(existing.capturedAt).toLocaleTimeString()}`
                  : 'No file selected'}
              </span>
              <input
                className="mt-3 block w-full text-sm"
                data-testid={`help-now-shot-${index}`}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  const item = saveEvidenceItem(`shot-${index}`, file);
                  const next = [...items.filter(entry => entry.promptId !== item.promptId), item];
                  setItems(next);
                  onBundleChange(next.length);
                  trackHelpNowEvent('evidence_bundle_created', {
                    item_count_bucket: bucketFor(next.length),
                    camera_denied: false,
                  });
                }}
              />
            </label>
          );
        })}
      </div>
      <p className="mt-4 text-xs font-semibold text-emerald-800" data-testid="help-now-local-only">
        Local metadata checklist · {items.length} items · nothing sent
      </p>
    </HelpNowPanel>
  );
}
