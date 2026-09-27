'use client';

import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type DownloadState = 'idle' | 'preparing' | 'success' | 'error';

type SignedDocument = {
  name: string;
  url: string;
};

function readSignedDocument(value: unknown, fallbackName: string): SignedDocument {
  if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') {
    throw new Error('Invalid signed document response');
  }

  const parsedUrl = new URL(value.url);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Invalid signed document URL');
  }

  const responseName = 'name' in value && typeof value.name === 'string' ? value.name.trim() : '';
  return { name: responseName || fallbackName, url: parsedUrl.toString() };
}

async function requestSignedDocument(args: {
  documentId: string;
  fallbackName: string;
  signal: AbortSignal;
}): Promise<SignedDocument> {
  const response = await fetch(`/api/documents/${encodeURIComponent(args.documentId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: args.signal,
  });
  if (!response.ok) throw new Error('Signed document request failed');

  return readSignedDocument(await response.json(), args.fallbackName);
}

function triggerDownload(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  anchor.referrerPolicy = 'no-referrer';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function MemberEvidenceDownloadButton({
  documentId,
  documentName,
}: Readonly<{ documentId: string; documentName: string }>) {
  const t = useTranslations('claims.informationRequests');
  const [state, setState] = useState<DownloadState>('idle');
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const handleDownload = async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState('preparing');

    try {
      const document = await requestSignedDocument({
        documentId,
        fallbackName: documentName,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      // Navigate directly to the attachment URL. Sending this bearer capability
      // through instrumented fetch/XHR would expose it to browser telemetry.
      triggerDownload(document.url, document.name);
      setState('success');
    } catch {
      if (!controller.signal.aborted) setState('error');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      inFlightRef.current = false;
    }
  };

  return (
    <div className="space-y-1" aria-busy={state === 'preparing'}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={state === 'preparing'}
        onClick={handleDownload}
      >
        {state === 'preparing' ? t('downloadPreparing') : t('download')}
      </Button>
      {state !== 'idle' ? (
        <output
          className="block max-w-64 text-sm text-muted-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          {state === 'preparing'
            ? t('downloadPreparing')
            : state === 'success'
              ? t('downloadSuccess')
              : t('downloadError')}
        </output>
      ) : null}
    </div>
  );
}
