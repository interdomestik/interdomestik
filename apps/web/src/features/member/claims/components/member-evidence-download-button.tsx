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

async function fetchDocumentBlob(args: {
  documentId: string;
  fallbackName: string;
  signal: AbortSignal;
}): Promise<{ blob: Blob; name: string }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const document = await requestSignedDocument(args);
    const response = await fetch(document.url, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: args.signal,
    });
    if (response.ok) return { blob: await response.blob(), name: document.name };
  }

  throw new Error('Document download failed');
}

export function MemberEvidenceDownloadButton({
  documentId,
  documentName,
}: Readonly<{ documentId: string; documentName: string }>) {
  const t = useTranslations('claims.informationRequests');
  const [state, setState] = useState<DownloadState>('idle');
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  let statusMessage: string | null = null;
  if (state === 'preparing') statusMessage = t('downloadPreparing');
  if (state === 'success') statusMessage = t('downloadSuccess');
  if (state === 'error') statusMessage = t('downloadError');

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
      const document = await fetchDocumentBlob({
        documentId,
        fallbackName: documentName,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(document.blob);
      triggerDownload(objectUrl, document.name);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
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
      {statusMessage ? (
        <output
          className="block max-w-64 text-sm text-muted-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusMessage}
        </output>
      ) : null}
    </div>
  );
}
