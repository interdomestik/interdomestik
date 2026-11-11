'use client';

import { getSupportHandoffDetail } from '@/actions/support-handoffs/detail';
import { useEffect, useId, useState, useTransition } from 'react';
import type { RestrictedRead } from '../communication/get-claim-message-metadata';
import type { HandoffMetadata } from './get-handoff-metadata';
import { HandoffMetadataFields, type MetadataLabels } from './handoff-metadata-fields';

export function HandoffMetadataPanel({
  handoffId,
  labels,
  fields,
  locale,
  missing,
  statuses,
}: Readonly<{
  handoffId: string;
  labels: Record<'expand' | 'collapse' | 'loading' | 'unavailable' | 'failed' | 'retry', string>;
  fields: MetadataLabels;
  locale: string;
  missing: { timestamp: string; assignee: string; branch: string };
  statuses: Record<string, string>;
}>) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RestrictedRead<HandoffMetadata[]> | null>(null);
  const [pending, startTransition] = useTransition();
  const panelId = useId();
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function load() {
    startTransition(async () => {
      try {
        const detail = await getSupportHandoffDetail(handoffId);
        setResult(detail && 'kind' in detail ? detail.result : { kind: 'unavailable' });
      } catch {
        setResult({ kind: 'failed' });
      }
    });
  }
  const row = result?.kind === 'ok' ? result.data[0] : null;
  function statusMessage() {
    if (pending) return labels.loading;
    if (row) return null;
    if (result?.kind === 'failed') return labels.failed;
    return labels.unavailable;
  }
  return (
    <div data-hydrated={isHydrated ? 'true' : 'false'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="staff-support-handoff-detail-toggle"
        className="rounded border px-3 py-2 focus-visible:outline focus-visible:outline-2"
        onClick={() => {
          setOpen(!open);
          if (!open && !result) load();
        }}
      >
        {open ? labels.collapse : labels.expand}
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="staff-support-handoff-detail-panel"
          className="mt-3 space-y-3"
        >
          <output className="block" aria-live="polite">
            {statusMessage()}
          </output>
          {row && (
            <HandoffMetadataFields
              data={row}
              labels={fields}
              locale={locale}
              missing={missing}
              statuses={statuses}
            />
          )}
          <button
            type="button"
            aria-disabled={pending}
            aria-busy={pending}
            className="rounded border px-3 py-2 focus-visible:outline focus-visible:outline-2"
            onClick={() => {
              if (!pending) load();
            }}
          >
            {labels.retry}
          </button>
        </div>
      )}
    </div>
  );
}
